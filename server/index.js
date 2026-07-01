import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server as SocketServer } from 'socket.io';

import { config } from './config.js';
import { loginSite, loginAdmin } from './auth.js';
import { registerSocketHandlers } from './sockets.js';
import { cleanupIdleRooms } from './rooms/roomManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', 'client', 'dist');

const app = express();
app.use(express.json());

// --- API REST de acceso ---

// Acceso a la web con el código compartido.
app.post('/api/access', (req, res) => {
  const token = loginSite(req.body?.code);
  if (!token) return res.status(401).json({ error: 'Código de acceso incorrecto.' });
  res.json({ token });
});

// Acceso al panel de administración.
app.post('/api/admin/access', (req, res) => {
  const token = loginAdmin(req.body?.code);
  if (!token) return res.status(401).json({ error: 'Código de administrador incorrecto.' });
  res.json({ token });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// --- Frontend compilado (producción) ---
// En desarrollo el frontend lo sirve Vite (puerto 5173) con proxy hacia aquí.
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) {
      res
        .status(200)
        .send('Frontend no compilado. Ejecuta "npm run build" o usa "npm run dev".');
    }
  });
});

// --- Servidor HTTP + Socket.IO ---
const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: true, credentials: true },
});
registerSocketHandlers(io);

// Limpieza periódica de salas inactivas.
setInterval(() => {
  const removed = cleanupIdleRooms();
  if (removed > 0) console.log(`[cleanup] ${removed} sala(s) inactiva(s) eliminada(s).`);
}, config.cleanupIntervalMs);

server.listen(config.port, () => {
  console.log(`Monopoly Deal escuchando en http://localhost:${config.port}`);
});

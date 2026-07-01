import { getSql } from '../../_lib/db.js';
import { getAuth } from '../../_lib/auth.js';
import { serializeRoom, gameStateFor } from '../../_lib/rooms.js';

// SSE: GET /api/rooms/:code/stream?playerId=...
// Sondea SOLO `version` (consulta diminuta) cada POLL_MS y, cuando cambia, descarga
// el estado y lo empuja filtrado para ese jugador. La conexión vive ~45 s y el
// cliente (EventSource) reconecta sola; así no chocamos con el límite de duración.
export const config = { maxDuration: 60 };

const POLL_MS = 300;
const LIFETIME_MS = 45_000;
const HEARTBEAT_MS = 15_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  if (!getAuth(req).isSite) {
    return res.status(401).json({ error: 'No autorizado.' });
  }
  const code = req.query.code;
  const playerId = req.query.playerId || null;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // evita buffering de proxies intermedios
  });

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  const sql = getSql();
  let lastVersion = -1;
  let lastBeat = Date.now();
  const start = Date.now();

  try {
    while (!closed && Date.now() - start < LIFETIME_MS) {
      const rows = await sql`SELECT version FROM rooms WHERE code = ${code}`;
      if (!rows.length) {
        send('gone', { code });
        break;
      }
      const version = rows[0].version;
      if (version !== lastVersion) {
        lastVersion = version;
        const full = await sql`SELECT state FROM rooms WHERE code = ${code}`;
        const room = full[0].state;
        send('update', {
          version,
          room: serializeRoom(room),
          game: gameStateFor(room, playerId),
        });
        lastBeat = Date.now();
      } else if (Date.now() - lastBeat > HEARTBEAT_MS) {
        res.write(`: keepalive\n\n`); // comentario SSE: mantiene viva la conexión
        lastBeat = Date.now();
      }
      await sleep(POLL_MS);
    }
    if (!closed) send('reconnect', { reason: 'lifetime' });
  } catch {
    try {
      send('error', { error: 'stream' });
    } catch {
      /* conexión ya cerrada */
    }
  } finally {
    res.end();
  }
}

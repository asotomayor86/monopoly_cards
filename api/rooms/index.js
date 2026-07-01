import { wrap, methodGuard } from '../_lib/handler.js';
import { requireSite } from '../_lib/auth.js';
import { listRooms } from '../_lib/rooms.js';

// GET  /api/rooms          → lista de salas activas (código, estado, jugadores).
// POST /api/rooms          → DESHABILITADO. Las salas se crean en el hub
//                            (one-page-to-rule-them-all). Se entra a la sala
//                            vía POST /api/rooms/{code}/enter.
export default wrap(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'POST'])) return;
  if (!requireSite(req, res)) return;

  if (req.method === 'GET') {
    return res.status(200).json({ rooms: await listRooms() });
  }

  return res.status(403).json({
    error: 'Las salas se crean en el hub. Entra desde una sala ya asignada.',
  });
});

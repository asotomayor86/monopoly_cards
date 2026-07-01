import { wrap, methodGuard } from '../_lib/handler.js';
import { requireAdmin } from '../_lib/auth.js';
import { listRooms } from '../_lib/rooms.js';

// GET /api/admin/rooms → lista de salas con metadatos (solo admin).
export default wrap(async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return;
  if (!requireAdmin(req, res)) return;
  res.status(200).json({ rooms: await listRooms() });
});

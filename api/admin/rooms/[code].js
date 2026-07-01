import { wrap, methodGuard } from '../../_lib/handler.js';
import { requireAdmin } from '../../_lib/auth.js';
import { closeRoom, listRooms } from '../../_lib/rooms.js';

// DELETE /api/admin/rooms/:code → cierra/elimina una sala (solo admin).
export default wrap(async (req, res) => {
  if (!methodGuard(req, res, ['DELETE'])) return;
  if (!requireAdmin(req, res)) return;
  await closeRoom(req.query.code);
  res.status(200).json({ rooms: await listRooms() });
});

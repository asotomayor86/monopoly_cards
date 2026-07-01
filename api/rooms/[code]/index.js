import { wrap, methodGuard } from '../../_lib/handler.js';
import { requireSite } from '../../_lib/auth.js';
import { getRoom, serializeRoom, gameStateFor } from '../../_lib/rooms.js';

// GET /api/rooms/:code?playerId=... → vista de sala + estado de juego del jugador.
export default wrap(async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return;
  if (!requireSite(req, res)) return;
  const cur = await getRoom(req.query.code);
  if (!cur) return res.status(404).json({ error: 'La sala no existe.' });
  const playerId = req.query.playerId || null;
  res.status(200).json({
    version: cur.version,
    room: serializeRoom(cur.room),
    game: gameStateFor(cur.room, playerId),
  });
});

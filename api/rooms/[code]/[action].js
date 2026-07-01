import { wrap, methodGuard } from '../../_lib/handler.js';
import { requireSite } from '../../_lib/auth.js';
import { getHubRoom } from '../../_lib/hub.js';
import {
  reconnect,
  startGame,
  nextGame,
  leaveRoom,
  applyGameAction,
  enterFromHub,
  serializeRoom,
  gameStateFor,
} from '../../_lib/rooms.js';

// Dispatcher único para las mutaciones de una sala. Un solo archivo = una sola
// función serverless (el plan Hobby limita a 12). El segmento dinámico :action
// (join | reconnect | start | leave | action) selecciona la operación.
export default wrap(async (req, res) => {
  if (!methodGuard(req, res, ['POST', 'PUT'])) return;
  const auth = requireSite(req, res);
  if (!auth) return;

  const code = req.query.code;
  const body = req.body || {};

  switch (req.query.action) {
    case 'enter': {
      // Entrada desde una sala del HUB: exige usuario identificado y que esté en
      // la sala del hub. Siembra/une la sala del juego con el userId del hub.
      if (!auth.user) {
        return res.status(401).json({ error: 'Inicia sesión con tu cuenta.' });
      }
      const sala = await getHubRoom(code);
      if (!sala) {
        return res
          .status(404)
          .json({ error: 'Esa sala no existe en el hub o ya está cerrada.' });
      }
      // Buscamos al jugador en la sala del hub; usamos SU nombre (apodo/nombre del
      // perfil del hub), no el de Neon Auth, para que coincida con el hub.
      const jugador = (sala.players || []).find(
        (p) => p.userId === auth.user.id && p.role === 'player',
      );
      if (!jugador) {
        return res
          .status(403)
          .json({ error: 'No estás en los jugadores de esta sala.' });
      }
      const { room, playerId, version } = await enterFromHub(
        code,
        { id: auth.user.id, name: jugador.name },
        { league: sala.league, winsNeeded: sala.winsNeeded },
      );
      return res.status(200).json({
        code: room.code,
        playerId,
        version,
        room: serializeRoom(room),
        game: gameStateFor(room, playerId),
      });
    }
    case 'join': {
      // Deshabilitado: las salas se crean en el hub y se entra vía `enter`.
      return res.status(403).json({
        error: 'Las salas se gestionan desde el hub. Entra por el enlace de la sala.',
      });
    }
    case 'reconnect': {
      const { room, version } = await reconnect(code, body.playerId);
      return res.status(200).json({
        code: room.code,
        playerId: body.playerId,
        version,
        room: serializeRoom(room),
        game: gameStateFor(room, body.playerId),
      });
    }
    case 'start': {
      const { room, version } = await startGame(code, body.playerId);
      return res.status(200).json({ version, room: serializeRoom(room) });
    }
    case 'next': {
      // Reinicio automático de la siguiente partida de una serie de liga.
      const { room, version } = await nextGame(code);
      return res.status(200).json({
        version,
        room: serializeRoom(room),
        game: gameStateFor(room, body.playerId),
      });
    }
    case 'leave': {
      const result = await leaveRoom(code, body.playerId);
      return res.status(200).json({ room: result ? serializeRoom(result.room) : null });
    }
    case 'action': {
      const { room, version } = await applyGameAction(code, body.playerId, body.action);
      return res.status(200).json({
        version,
        room: serializeRoom(room),
        game: gameStateFor(room, body.playerId),
      });
    }
    default:
      return res.status(404).json({ error: 'Acción de sala no encontrada.' });
  }
});

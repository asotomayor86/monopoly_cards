import { EVENTS, ROLE } from '../shared/constants.js';
import { getSession } from './auth.js';
import {
  RoomError,
  createRoom,
  joinRoom,
  reconnect,
  leaveRoom,
  markDisconnected,
  startGame,
  restartGame,
  applyGameAction,
  gameStateFor,
  closeRoom,
  listRooms,
  serializeRoom,
} from './rooms/roomManager.js';
import { GameError } from './game/gameEngine.js';
import { store } from './store/index.js';

/** Emite el estado actualizado de una sala a todos sus miembros. */
function broadcastRoom(io, room) {
  if (!room) return;
  io.to(room.code).emit(EVENTS.ROOM_UPDATE, serializeRoom(room));
}

/**
 * Emite el estado de juego personalizado a cada miembro de la sala
 * (cada jugador solo ve su propia mano).
 */
async function broadcastGameState(io, room) {
  if (!room?.game) return;
  const sockets = await io.in(room.code).fetchSockets();
  for (const s of sockets) {
    const pid = s.data.playerId;
    if (pid) s.emit(EVENTS.GAME_STATE, gameStateFor(room, pid));
  }
}

/** Envuelve un handler para devolver siempre un ack { ok, ... } y capturar errores de dominio. */
function handle(fn) {
  return async (payload, ack) => {
    try {
      const result = await fn(payload || {});
      if (typeof ack === 'function') ack({ ok: true, ...result });
    } catch (err) {
      const known = err instanceof RoomError || err instanceof GameError;
      const message = known ? err.message : 'Ha ocurrido un error inesperado.';
      if (!known) console.error('[socket]', err);
      if (typeof ack === 'function') ack({ ok: false, error: message });
    }
  };
}

export function registerSocketHandlers(io) {
  // Middleware de autenticación: cada socket debe traer un token de sesión válido.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const session = getSession(token);
    if (!session) return next(new Error('No autorizado. Vuelve a introducir el código.'));
    socket.data.role = session.role;
    next();
  });

  io.on('connection', (socket) => {
    const isAdmin = socket.data.role === ROLE.ADMIN;

    // --- Jugador ---
    // ROOM_CREATE y ROOM_JOIN están deshabilitados: las salas siempre vienen del
    // hub. Se entra vía POST /api/rooms/{code}/enter (ver enterHubRoom).
    socket.on(
      EVENTS.ROOM_CREATE,
      handle(async () => {
        throw new RoomError(
          'Las salas se crean en el hub. Entra desde la sala que te hayan asignado.',
        );
      })
    );

    socket.on(
      EVENTS.ROOM_JOIN,
      handle(async () => {
        throw new RoomError(
          'Las salas se gestionan en el hub. Entra desde la sala que te hayan asignado.',
        );
      })
    );

    socket.on(
      EVENTS.ROOM_RECONNECT,
      handle(async ({ code, playerId }) => {
        const { room, player } = reconnect(code, playerId);
        socket.data.roomCode = room.code;
        socket.data.playerId = player.id;
        socket.join(room.code);
        broadcastRoom(io, room);
        // Si hay partida en curso, manda el estado actual a quien reconecta.
        if (room.game) socket.emit(EVENTS.GAME_STATE, gameStateFor(room, player.id));
        return {
          roomCode: room.code,
          playerId: player.id,
          room: serializeRoom(room),
          game: room.game ? gameStateFor(room, player.id) : null,
        };
      })
    );

    socket.on(
      EVENTS.ROOM_START,
      handle(async () => {
        const { roomCode, playerId } = socket.data;
        const room = startGame(roomCode, playerId);
        broadcastRoom(io, room);
        await broadcastGameState(io, room);
        return { room: serializeRoom(room) };
      })
    );

    socket.on(
      EVENTS.ROOM_RESTART,
      handle(async () => {
        const { roomCode, playerId } = socket.data;
        const room = restartGame(roomCode, playerId);
        broadcastRoom(io, room);
        await broadcastGameState(io, room);
        return { room: serializeRoom(room) };
      })
    );

    socket.on(
      EVENTS.GAME_ACTION,
      handle(async ({ action }) => {
        const { roomCode, playerId } = socket.data;
        const { room } = applyGameAction(roomCode, playerId, action);
        await broadcastGameState(io, room);
        broadcastRoom(io, room); // el estado de sala puede pasar a "terminada"
        return {};
      })
    );

    socket.on(
      EVENTS.ROOM_LEAVE,
      handle(async () => {
        const { roomCode, playerId } = socket.data;
        const room = leaveRoom(roomCode, playerId);
        socket.leave(roomCode);
        socket.data.roomCode = null;
        socket.data.playerId = null;
        broadcastRoom(io, room);
        return {};
      })
    );

    // --- Administrador ---
    socket.on(
      EVENTS.ADMIN_LIST,
      handle(async () => {
        if (!isAdmin) throw new RoomError('Acceso de administrador requerido.');
        return { rooms: listRooms() };
      })
    );

    socket.on(
      EVENTS.ADMIN_CLOSE,
      handle(async ({ code }) => {
        if (!isAdmin) throw new RoomError('Acceso de administrador requerido.');
        const room = store.get(code);
        if (room) {
          io.to(room.code).emit(EVENTS.ROOM_CLOSED, {
            reason: 'Un administrador ha cerrado la sala.',
          });
        }
        closeRoom(code);
        return { rooms: listRooms() };
      })
    );

    // --- Desconexión ---
    socket.on('disconnect', () => {
      const { roomCode, playerId } = socket.data;
      if (roomCode && playerId) {
        const room = markDisconnected(roomCode, playerId);
        broadcastRoom(io, room);
      }
    });
  });
}

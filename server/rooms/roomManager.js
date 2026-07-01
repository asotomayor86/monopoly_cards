import { nanoid } from 'nanoid';
import { store } from '../store/index.js';
import { generateUniqueCode, normalizeCode } from './codes.js';
import { config } from '../config.js';
import { ROOM_STATUS, MIN_PLAYERS, MAX_PLAYERS } from '../../shared/constants.js';
import { createGame, applyAction, serializeState } from '../game/gameEngine.js';

/**
 * Error de dominio con código legible para el cliente.
 */
export class RoomError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RoomError';
  }
}

function now() {
  return Date.now();
}

function touch(room) {
  room.lastActivity = now();
  return room;
}

function makePlayer(nickname, isHost) {
  return {
    id: nanoid(16),
    nickname,
    isHost,
    connected: true,
  };
}

function cleanNickname(nickname) {
  const n = String(nickname || '').trim();
  if (!n) throw new RoomError('Necesitas un apodo.');
  if (n.length > 20) return n.slice(0, 20);
  return n;
}

/**
 * Crea una sala nueva y devuelve { room, playerId }. El creador es anfitrión.
 */
export function createRoom(nickname) {
  const cleanNick = cleanNickname(nickname);
  const code = generateUniqueCode((c) => store.has(c));
  const host = makePlayer(cleanNick, true);
  const room = {
    code,
    hostId: host.id,
    status: ROOM_STATUS.WAITING,
    players: [host],
    createdAt: now(),
    lastActivity: now(),
    game: null, // se rellena al empezar la partida (fases posteriores)
  };
  store.set(room);
  return { room, playerId: host.id };
}

/**
 * Une un jugador a una sala existente. Devuelve { room, playerId }.
 */
export function joinRoom(rawCode, nickname) {
  const code = normalizeCode(rawCode);
  const room = store.get(code);
  if (!room) throw new RoomError('No existe ninguna sala con ese código.');
  if (room.status !== ROOM_STATUS.WAITING) {
    throw new RoomError('La partida ya ha empezado en esa sala.');
  }
  if (room.players.length >= MAX_PLAYERS) {
    throw new RoomError(`La sala está llena (máximo ${MAX_PLAYERS} jugadores).`);
  }
  const cleanNick = cleanNickname(nickname);
  const taken = room.players.some(
    (p) => p.nickname.toLowerCase() === cleanNick.toLowerCase()
  );
  if (taken) throw new RoomError('Ya hay alguien con ese apodo en la sala.');

  const player = makePlayer(cleanNick, false);
  room.players.push(player);
  touch(room);
  store.set(room);
  return { room, playerId: player.id };
}

/**
 * Reasocia un jugador que se había desconectado (por código + playerId).
 * Devuelve { room, player }.
 */
export function reconnect(rawCode, playerId) {
  const code = normalizeCode(rawCode);
  const room = store.get(code);
  if (!room) throw new RoomError('La sala ya no existe.');
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new RoomError('Tu sitio en la sala ya no está disponible.');
  player.connected = true;
  touch(room);
  store.set(room);
  return { room, player };
}

/**
 * Marca un jugador como desconectado (no lo elimina, para permitir reconexión).
 * Si la sala está en espera y se queda sin nadie conectado, se elimina.
 * Devuelve la sala (o null si se eliminó).
 */
export function markDisconnected(code, playerId) {
  const room = store.get(code);
  if (!room) return null;
  const player = room.players.find((p) => p.id === playerId);
  if (player) player.connected = false;
  touch(room);

  // En sala de espera, si un jugador desconectado nunca vuelve, no queremos basura:
  // si no queda nadie conectado, eliminamos la sala.
  const anyoneConnected = room.players.some((p) => p.connected);
  if (!anyoneConnected && room.status === ROOM_STATUS.WAITING) {
    store.delete(code);
    return null;
  }
  store.set(room);
  return room;
}

/**
 * Saca a un jugador de una sala de forma explícita (botón "salir").
 * Reasigna anfitrión si era el host. Elimina la sala si queda vacía.
 * Devuelve la sala (o null si se eliminó).
 */
export function leaveRoom(code, playerId) {
  const room = store.get(code);
  if (!room) return null;
  room.players = room.players.filter((p) => p.id !== playerId);

  if (room.players.length === 0) {
    store.delete(code);
    return null;
  }
  // Reasignar anfitrión si hace falta.
  if (room.hostId === playerId) {
    const newHost = room.players[0];
    newHost.isHost = true;
    room.hostId = newHost.id;
  }
  touch(room);
  store.set(room);
  return room;
}

/**
 * Empieza la partida. Solo el anfitrión, con al menos MIN_PLAYERS.
 * En la Fase 1 solo cambia el estado; la creación de la partida llega en la Fase 2/3.
 */
export function startGame(code, requesterId) {
  const room = store.get(code);
  if (!room) throw new RoomError('La sala ya no existe.');
  if (room.hostId !== requesterId) {
    throw new RoomError('Solo el anfitrión puede empezar la partida.');
  }
  if (room.players.length < MIN_PLAYERS) {
    throw new RoomError(`Hacen falta al menos ${MIN_PLAYERS} jugadores.`);
  }
  if (room.status !== ROOM_STATUS.WAITING) {
    throw new RoomError('La partida ya ha empezado.');
  }
  room.status = ROOM_STATUS.PLAYING;
  room.game = createGame(room.players.map((p) => ({ id: p.id, nickname: p.nickname })));
  touch(room);
  store.set(room);
  return room;
}

/**
 * Reinicia la partida con los mismos jugadores ("jugar otra"). Solo el anfitrión.
 */
export function restartGame(code, requesterId) {
  const room = store.get(code);
  if (!room) throw new RoomError('La sala ya no existe.');
  if (room.hostId !== requesterId) throw new RoomError('Solo el anfitrión puede reiniciar.');
  if (room.players.length < MIN_PLAYERS) {
    throw new RoomError(`Hacen falta al menos ${MIN_PLAYERS} jugadores.`);
  }
  room.status = ROOM_STATUS.PLAYING;
  room.game = createGame(room.players.map((p) => ({ id: p.id, nickname: p.nickname })));
  touch(room);
  store.set(room);
  return room;
}

/**
 * Aplica una acción de juego de un jugador. Valida con el motor (autoridad del servidor).
 * Devuelve { room, events }. Lanza el error del motor si la acción no es válida.
 */
export function applyGameAction(code, playerId, action) {
  const room = store.get(code);
  if (!room || !room.game) throw new RoomError('No hay ninguna partida en curso.');
  const { state, events } = applyAction(room.game, action, playerId);
  room.game = state;
  if (state.status === 'finished') room.status = ROOM_STATUS.FINISHED;
  touch(room);
  store.set(room);
  return { room, events };
}

/** Vista del estado de juego para un jugador concreto (oculta las manos ajenas). */
export function gameStateFor(room, playerId) {
  if (!room?.game) return null;
  return serializeState(room.game, playerId);
}

/** Cierra/elimina una sala (uso del admin). */
export function closeRoom(code) {
  return store.delete(normalizeCode(code));
}

/** Lista todas las salas con metadatos para el panel de administración. */
export function listRooms() {
  return store.list().map((room) => ({
    code: room.code,
    status: room.status,
    playerCount: room.players.length,
    connectedCount: room.players.filter((p) => p.connected).length,
    players: room.players.map((p) => ({ nickname: p.nickname, connected: p.connected })),
    createdAt: room.createdAt,
    lastActivity: room.lastActivity,
    ageMs: now() - room.createdAt,
    idleMs: now() - room.lastActivity,
  }));
}

/**
 * Vista pública de una sala para enviar a los clientes (sin datos ocultos).
 * En fases posteriores aquí se filtrarán las manos privadas de cada jugador.
 */
export function serializeRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      isHost: p.isHost,
      connected: p.connected,
    })),
  };
}

/** Barrido de limpieza de salas inactivas. Devuelve el número de salas eliminadas. */
export function cleanupIdleRooms() {
  let removed = 0;
  for (const room of store.list()) {
    if (now() - room.lastActivity > config.roomIdleMs) {
      store.delete(room.code);
      removed++;
    }
  }
  return removed;
}

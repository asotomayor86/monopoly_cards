import { EVENTS } from '../../shared/constants.js';
import { session } from './state/session.js';
import { logoutNeon } from './auth.js';

// Capa de transporte sobre la API REST + SSE (sustituye a socket.io).
// Mantiene la firma `emitAsync(evento, payload)` para que las pantallas existentes
// (Lobby, RoomScreen, GameBoard, AdminScreen) no necesiten cambios: cada antiguo
// evento socket.io se traduce a una llamada HTTP. La autenticación va por cookie
// httpOnly (credentials: 'same-origin'), no por token en el cliente.

// Prefijo de ruta del juego. Cuando monopoly se sirve desde el hub via rewrite
// (gamehub.family/monopoly/...) las llamadas a /api/* deben llevar /monopoly
// delante para que el reescribir las lleve a este proyecto y no al hub. Si
// estamos en el subdominio (monopoly.gamehub.family) o en localhost/dev, el
// prefijo queda vacío.
function pathPrefix() {
  if (typeof location === 'undefined') return '';
  if (location.hostname === 'gamehub.family' && location.pathname.startsWith('/monopoly')) {
    return '/monopoly';
  }
  return '';
}

async function http(method, path, body) {
  const url = path.startsWith('/api/') ? pathPrefix() + path : path;
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta sin cuerpo */
  }
  if (!res.ok) throw new Error(data?.error || 'Error de red.');
  return data || {};
}

/** Traduce los eventos socket.io originales a llamadas REST. */
export async function emitAsync(event, payload = {}) {
  const { code, playerId } = session.getRoom();
  const enc = encodeURIComponent;

  switch (event) {
    case EVENTS.ROOM_CREATE: {
      const r = await http('POST', '/api/rooms', { nickname: payload.nickname });
      return { roomCode: r.code, playerId: r.playerId, room: r.room };
    }
    case EVENTS.ROOM_JOIN: {
      const r = await http('POST', `/api/rooms/${enc(payload.code)}/join`, {
        nickname: payload.nickname,
      });
      return { roomCode: r.code, playerId: r.playerId, room: r.room };
    }
    case EVENTS.ROOM_RECONNECT: {
      const r = await http('POST', `/api/rooms/${enc(payload.code)}/reconnect`, {
        playerId: payload.playerId,
      });
      return { roomCode: r.code, playerId: r.playerId, room: r.room, game: r.game };
    }
    case EVENTS.ROOM_START:
    case EVENTS.ROOM_RESTART: {
      const r = await http('POST', `/api/rooms/${enc(code)}/start`, { playerId });
      return { room: r.room };
    }
    case EVENTS.ROOM_NEXT: {
      const r = await http('POST', `/api/rooms/${enc(code)}/next`, { playerId });
      return { room: r.room, game: r.game };
    }
    case EVENTS.ROOM_LEAVE: {
      const r = await http('POST', `/api/rooms/${enc(code)}/leave`, { playerId });
      return { room: r.room };
    }
    case EVENTS.GAME_ACTION: {
      const r = await http('PUT', `/api/rooms/${enc(code)}/action`, {
        playerId,
        action: payload.action,
      });
      return { room: r.room, game: r.game };
    }
    case EVENTS.ADMIN_LIST:
      return http('GET', '/api/admin/rooms');
    case EVENTS.ADMIN_CLOSE:
      return http('DELETE', `/api/admin/rooms/${enc(payload.code)}`);
    default:
      throw new Error('Evento no soportado: ' + event);
  }
}

/** Estado de autenticación actual (la cookie es httpOnly; lo consulta el servidor). */
export function checkAuth() {
  return http('GET', '/api/me');
}

/** Tras el login con Neon Auth, fija la sesión del juego (cookie mc_user). */
export function setServerSession(user) {
  return http('POST', '/api/access', { userId: user.id, name: user.name });
}

/**
 * Entra en una sala creada en el hub: valida la pertenencia contra el hub y
 * siembra/une la sala del juego. Devuelve { code, playerId, room, game }.
 */
export function enterHubRoom(code) {
  return http('POST', `/api/rooms/${encodeURIComponent(code)}/enter`);
}

/** Lista de salas activas (código, estado, jugadores) para el lobby. */
export function listActiveRooms() {
  return http('GET', '/api/rooms');
}

/** Valida la contraseña de administrador y deja la cookie de admin. */
export function accessAdmin(code) {
  return http('POST', '/api/admin/access', { code });
}

/** Cierra sesión: caduca la cookie del juego y la sesión de Neon Auth. */
export async function logout() {
  await http('DELETE', '/api/access').catch(() => {});
  await logoutNeon();
}

/**
 * Suscripción en tiempo real a una sala vía SSE. Llama a onUpdate({version, room, game})
 * en cada cambio y a onGone() si la sala desaparece. El navegador reconecta solo cuando
 * el servidor cierra el stream por fin de vida (~45 s). Devuelve una función para cancelar.
 */
export function subscribeRoom(code, playerId, { onUpdate, onGone } = {}) {
  const url = `${pathPrefix()}/api/rooms/${encodeURIComponent(code)}/stream?playerId=${encodeURIComponent(
    playerId || ''
  )}`;
  const es = new EventSource(url, { withCredentials: true });
  es.addEventListener('update', (e) => {
    try {
      onUpdate?.(JSON.parse(e.data));
    } catch {
      /* ignora frames corruptos */
    }
  });
  es.addEventListener('gone', () => {
    es.close();
    onGone?.();
  });
  // El evento 'reconnect' (fin de vida del stream) no requiere acción: al cerrarse la
  // conexión, EventSource reconecta automáticamente.
  return () => es.close();
}

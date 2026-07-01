import { nanoid } from 'nanoid';
import { getSql } from './db.js';
import { generateUniqueCode, normalizeCode } from '../../server/rooms/codes.js';
import { ROOM_STATUS, MIN_PLAYERS, MAX_PLAYERS } from '../../shared/constants.js';
import { createGame, applyAction, serializeState } from '../../server/game/gameEngine.js';
import { submitHubResult } from './hub.js';

// Port del roomManager a Neon. La lógica de dominio es idéntica a la versión socket.io;
// solo cambia la persistencia: en vez de un store en memoria, cada sala es una fila
// (code, state jsonb, version) y las escrituras usan concurrencia optimista (CAS).

export class RoomError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RoomError';
  }
}

const MAX_RETRIES = 6;

// Cuentas atrás (ms) de las salas de liga: tiempo entre partidas de la serie y
// tiempo de cortesía antes de devolver a todos al hub al acabar el partido.
const INTERMISSION_MS = 5000;
const RETURN_MS = 5000;

// --- Acceso a BD ---

async function readRoom(sql, code) {
  const rows = await sql`SELECT state, version FROM rooms WHERE code = ${code}`;
  if (!rows.length) return null;
  return { room: rows[0].state, version: rows[0].version };
}

/** Escritura con CAS. Devuelve la nueva version, o null si hubo conflicto. */
async function writeRoomCAS(sql, room, expectedVersion) {
  const rows = await sql`
    UPDATE rooms
    SET state = ${JSON.stringify(room)}::jsonb,
        version = version + 1,
        status = ${room.status},
        updated_at = now()
    WHERE code = ${room.code} AND version = ${expectedVersion}
    RETURNING version`;
  return rows.length ? rows[0].version : null;
}

/**
 * Carga la sala, aplica `mutator(room)` y guarda con CAS, reintentando si otro
 * cambio se coló en medio. `mutator` puede devolver un valor extra (p.ej. playerId).
 */
async function mutateRoom(code, mutator) {
  const sql = getSql();
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const cur = await readRoom(sql, code);
    if (!cur) throw new RoomError('La sala ya no existe.');
    const extra = mutator(cur.room);
    const newVersion = await writeRoomCAS(sql, cur.room, cur.version);
    if (newVersion !== null) return { room: cur.room, version: newVersion, extra };
  }
  throw new RoomError('Demasiada concurrencia en la sala, inténtalo de nuevo.');
}

// --- Helpers de dominio (idénticos al original) ---

function now() {
  return Date.now();
}

function makePlayer(nickname, isHost) {
  return { id: nanoid(16), nickname, isHost, connected: true, lastSeen: now() };
}

function cleanNickname(nickname) {
  const n = String(nickname || '').trim();
  if (!n) throw new RoomError('Necesitas un apodo.');
  if (n.length > 20) return n.slice(0, 20);
  return n;
}

// --- Operaciones ---

/** Crea una sala nueva. Reintenta si el código aleatorio choca (PK). */
export async function createRoom(nickname) {
  const sql = getSql();
  const cleanNick = cleanNickname(nickname);
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = generateUniqueCode(() => false); // unicidad real la asegura el PK
    const host = makePlayer(cleanNick, true);
    const room = {
      code,
      hostId: host.id,
      status: ROOM_STATUS.WAITING,
      players: [host],
      createdAt: now(),
      lastActivity: now(),
      game: null,
    };
    try {
      await sql`
        INSERT INTO rooms (code, state, version, status)
        VALUES (${code}, ${JSON.stringify(room)}::jsonb, 0, ${room.status})`;
      return { room, playerId: host.id, version: 0 };
    } catch (err) {
      if (String(err.message).includes('duplicate key')) continue; // código repetido
      throw err;
    }
  }
  throw new RoomError('No se pudo crear la sala, inténtalo de nuevo.');
}

export async function joinRoom(rawCode, nickname) {
  const code = normalizeCode(rawCode);
  const cleanNick = cleanNickname(nickname);
  let playerId = null;
  const { room, version } = await mutateRoom(code, (room) => {
    // Partida ya empezada (o terminada): solo se permite REINGRESAR a quien ya
    // estaba en ella y se salió (p.ej. por error). Se identifica por apodo: si
    // coincide con un jugador de la partida que ya no está en la sala, recupera
    // su sitio con su mismo id (y por tanto su mano y su equipo intactos).
    if (room.status !== ROOM_STATUS.WAITING) {
      const players = room.game?.players || {};
      const match = Object.entries(players).find(
        ([, p]) => p.nickname.toLowerCase() === cleanNick.toLowerCase()
      );
      const present = new Set(room.players.map((p) => p.id));
      if (match && !present.has(match[0])) {
        const [pid, gp] = match;
        room.players.push({ id: pid, nickname: gp.nickname, isHost: false, connected: true, lastSeen: now() });
        room.lastActivity = now();
        playerId = pid;
        return;
      }
      throw new RoomError('La partida ya ha empezado en esa sala.');
    }
    if (room.players.length >= MAX_PLAYERS) {
      throw new RoomError(`La sala está llena (máximo ${MAX_PLAYERS} jugadores).`);
    }
    if (room.players.some((p) => p.nickname.toLowerCase() === cleanNick.toLowerCase())) {
      throw new RoomError('Ya hay alguien con ese apodo en la sala.');
    }
    const player = makePlayer(cleanNick, false);
    room.players.push(player);
    room.lastActivity = now();
    playerId = player.id;
  });
  return { room, playerId, version };
}

/** Revalida que un jugador sigue en la sala (reanudar sesión tras recargar). */
export async function reconnect(rawCode, playerId) {
  const code = normalizeCode(rawCode);
  const { room, version } = await mutateRoom(code, (room) => {
    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new RoomError('Tu sitio en la sala ya no está disponible.');
    player.connected = true;
    player.lastSeen = now();
    room.lastActivity = now();
  });
  return { room, version };
}

/**
 * Entra a una sala creada en el HUB. La sala del juego se identifica con el MISMO
 * código del hub, y el id de jugador del juego es el userId del hub. La pertenencia
 * (que el userId esté en la sala del hub) la valida el endpoint ANTES de llamar aquí.
 * El primero en entrar es el anfitrión; los demás se van uniendo al abrir el juego.
 */
export async function enterFromHub(rawCode, user, hubMeta = {}) {
  const code = normalizeCode(rawCode);
  const sql = getSql();
  const nickname = (String(user.name || '').trim().slice(0, 20)) || 'Jugador';

  // Toda partida que viene del hub se juega "al mejor de N" usando el
  // winsNeeded que define la sala (1 por defecto). Al terminar la serie se
  // devuelve a todos al hub. `isLeague` se conserva solo a título informativo.
  const isLeague = !!hubMeta.league;
  const bestOf = Math.max(1, Number(hubMeta.winsNeeded) || 1);

  // Crear la sala del juego la primera vez (el primero en entrar es anfitrión).
  const existing = await readRoom(sql, code);
  if (!existing) {
    const player = { id: user.id, nickname, isHost: true, connected: true, lastSeen: now() };
    const room = {
      code,
      hostId: user.id,
      status: ROOM_STATUS.WAITING,
      players: [player],
      createdAt: now(),
      lastActivity: now(),
      game: null,
      fromHub: true, // marca que esta sala vino del hub → al acabar, enviar resultado
      isLeague,
      bestOf,
      seriesWins: {}, // userId -> partidas ganadas en esta serie
      seriesGame: 1, // número de partida dentro de la serie
    };
    try {
      await sql`
        INSERT INTO rooms (code, state, version, status)
        VALUES (${code}, ${JSON.stringify(room)}::jsonb, 0, ${room.status})`;
      return { room, playerId: user.id, version: 0 };
    } catch (err) {
      if (!String(err.message).includes('duplicate key')) throw err;
      // Otra petición la creó a la vez → seguimos a unirse.
    }
  }

  // Unirse o reconectar, identificando por userId (no por apodo).
  const { room, version } = await mutateRoom(code, (room) => {
    const mine = room.players.find((p) => p.id === user.id);
    if (mine) {
      mine.connected = true;
      mine.lastSeen = now();
      mine.nickname = nickname;
      room.lastActivity = now();
      return;
    }
    if (room.status !== ROOM_STATUS.WAITING) {
      const gp = room.game?.players?.[user.id];
      if (!gp) throw new RoomError('La partida ya ha empezado en esta sala.');
      room.players.push({ id: user.id, nickname, isHost: false, connected: true, lastSeen: now() });
      room.lastActivity = now();
      return;
    }
    if (room.players.length >= MAX_PLAYERS) {
      throw new RoomError(`La sala está llena (máximo ${MAX_PLAYERS} jugadores).`);
    }
    room.players.push({ id: user.id, nickname, isHost: false, connected: true, lastSeen: now() });
    room.lastActivity = now();
  });
  return { room, playerId: user.id, version };
}

/** Empieza la partida (o la reinicia si ya terminó). Solo el anfitrión. */
export async function startGame(code, requesterId) {
  const { room, version } = await mutateRoom(normalizeCode(code), (room) => {
    if (room.hostId !== requesterId) {
      throw new RoomError('Solo el anfitrión puede empezar la partida.');
    }
    if (room.players.length < MIN_PLAYERS) {
      throw new RoomError(`Hacen falta al menos ${MIN_PLAYERS} jugadores.`);
    }
    if (room.status === ROOM_STATUS.PLAYING) {
      throw new RoomError('La partida ya ha empezado.');
    }
    room.status = ROOM_STATUS.PLAYING;
    room.game = createGame(room.players.map((p) => ({ id: p.id, nickname: p.nickname })));
    // Nueva partida (incluida la revancha): permitir enviar su resultado al hub.
    room.resultSent = false;
    // Arranca una serie limpia para todos (best-of de la sala del hub).
    room.phase = null;
    room.resumeAt = null;
    room.returnAt = null;
    room.seriesWins = {};
    room.seriesGame = 1;
    room.seriesWinner = null;
    room.lastActivity = now();
  });
  return { room, version };
}

/**
 * Arranca la siguiente partida de una serie de liga tras el intermedio. Es
 * idempotente: solo actúa si la sala está en intermedio, así que aunque varios
 * clientes la invoquen al acabar la cuenta atrás, solo se crea una partida.
 */
export async function nextGame(code) {
  const { room, version } = await mutateRoom(normalizeCode(code), (room) => {
    if (room.phase !== 'intermission') return; // ya avanzó o no procede
    if (room.players.length < MIN_PLAYERS) return; // falta algún jugador
    room.status = ROOM_STATUS.PLAYING;
    room.game = createGame(room.players.map((p) => ({ id: p.id, nickname: p.nickname })));
    room.phase = null;
    room.resumeAt = null;
    room.seriesGame = (room.seriesGame || 1) + 1;
    room.lastActivity = now();
  });
  return { room, version };
}

/** Construye el resultado para el hub: el ganador 'win', el resto 'loss'. */
function resultadosParaHub(state, winnerId) {
  const ganador = winnerId ?? state.winner;
  return Object.keys(state.players || {}).map((uid) => ({
    userId: uid,
    result: uid === ganador ? 'win' : 'loss',
  }));
}

/** Aplica una acción de juego validándola con el motor (autoridad del servidor). */
export async function applyGameAction(code, playerId, action) {
  let enviarAlHub = null; // payload de resultado si la partida acaba de terminar
  const { room, version, extra } = await mutateRoom(normalizeCode(code), (room) => {
    if (!room.game) throw new RoomError('No hay ninguna partida en curso.');
    const yaTerminada = room.status === ROOM_STATUS.FINISHED;
    const { state, events } = applyAction(room.game, action, playerId);
    room.game = state;
    if (state.status === 'finished') {
      room.status = ROOM_STATUS.FINISHED;
      if (!yaTerminada) {
        // Toda sala (sea de liga o no) se juega al mejor de `bestOf`. Sumamos la
        // victoria de esta partida y decidimos si la serie continúa o ha
        // terminado. Cuando termina, mandamos el resultado al hub una sola vez.
        const ganador = state.winner;
        room.seriesWins = room.seriesWins || {};
        if (ganador) {
          room.seriesWins[ganador] = (room.seriesWins[ganador] || 0) + 1;
        }
        const objetivo = room.bestOf || 1;
        const ganadorSerie = Object.keys(room.seriesWins).find(
          (uid) => room.seriesWins[uid] >= objetivo,
        );
        if (ganadorSerie) {
          // Serie terminada → enviar resultado al hub una sola vez y abrir la
          // cuenta atrás para devolver a todos al hub.
          room.phase = 'returning';
          room.seriesWinner = ganadorSerie;
          room.returnAt = now() + RETURN_MS;
          if (room.fromHub && !room.resultSent) {
            room.resultSent = true;
            enviarAlHub = resultadosParaHub(state, ganadorSerie);
          }
        } else {
          // Aún quedan partidas por ganar → intermedio con cuenta atrás antes
          // de reiniciar automáticamente la siguiente partida.
          room.phase = 'intermission';
          room.resumeAt = now() + INTERMISSION_MS;
        }
      }
    }
    room.lastActivity = now();
    return events;
  });

  // Envío del resultado al hub (fuera del CAS). Si falla, queda registrado en logs;
  // el admin siempre puede registrar la partida a mano en el hub.
  if (enviarAlHub) {
    try {
      // closeRoom=true: monopoly solo envía el resultado al hub cuando la
      // serie best-of-N ha terminado (ganadorSerie está fijado). Esa misma
      // señal le dice al hub que cierre la sala de forma automática.
      const r = await submitHubResult(room.code, {
        kind: 'ranked',
        results: enviarAlHub,
        closeRoom: true,
      });
      if (!r.ok) console.error('[hub] resultado rechazado:', r.status, r.error || '');
    } catch (err) {
      console.error('[hub] error enviando resultado:', err.message);
    }
  }

  return { room, version, events: extra };
}

/** Saca a un jugador. Reasigna anfitrión o elimina la sala si queda vacía. */
export async function leaveRoom(rawCode, playerId) {
  const code = normalizeCode(rawCode);
  const sql = getSql();
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const cur = await readRoom(sql, code);
    if (!cur) return null;
    const room = cur.room;
    room.players = room.players.filter((p) => p.id !== playerId);
    if (room.players.length === 0) {
      await sql`DELETE FROM rooms WHERE code = ${code}`;
      return null;
    }
    if (room.hostId === playerId) {
      room.players[0].isHost = true;
      room.hostId = room.players[0].id;
    }
    room.lastActivity = now();
    const v = await writeRoomCAS(sql, room, cur.version);
    if (v !== null) return { room, version: v };
  }
  throw new RoomError('Demasiada concurrencia en la sala, inténtalo de nuevo.');
}

/** Lee una sala (sin mutar). Devuelve null si no existe. */
export async function getRoom(rawCode) {
  return readRoom(getSql(), normalizeCode(rawCode));
}

/** Cierra/elimina una sala (admin). */
export async function closeRoom(rawCode) {
  await getSql()`DELETE FROM rooms WHERE code = ${normalizeCode(rawCode)}`;
  return true;
}

/** Lista todas las salas con metadatos (panel de administración). */
export async function listRooms() {
  const rows = await getSql()`SELECT state FROM rooms ORDER BY updated_at DESC`;
  return rows.map(({ state: room }) => ({
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

// --- Serialización (idéntica al original) ---

/** Vista pública de la sala (sin datos ocultos). */
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
    // Estado de la serie best-of (presente siempre que la sala venga del hub).
    // `now` permite al cliente corregir el desfase de reloj en las cuentas atrás.
    series: room.fromHub
      ? {
          isLeague: !!room.isLeague,
          bestOf: room.bestOf || 1,
          wins: room.seriesWins || {},
          gameNumber: room.seriesGame || 1,
          phase: room.phase || null, // 'intermission' | 'returning' | null
          resumeAt: room.resumeAt || null,
          returnAt: room.returnAt || null,
          winner: room.seriesWinner || null,
          now: now(),
        }
      : null,
  };
}

/** Vista del estado de juego para un jugador concreto (oculta las manos ajenas). */
export function gameStateFor(room, playerId) {
  if (!room?.game) return null;
  return serializeState(room.game, playerId);
}

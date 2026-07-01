// Motor de reglas de Monopoly Deal — STUB de la Fase 1.
//
// En la Fase 1 solo existe el andamiaje de salas/lobby/hub. El motor real
// (baraja de 110 cartas, turnos, sets, alquileres, cartas de acción, victoria
// con 3 sets) se implementa en la Fase 2. Este stub mantiene la MISMA firma que
// consumen el roomManager (dev, socket.io) y api/_lib/rooms.js (producción):
//   createGame(players) -> state
//   applyAction(state, action, playerId) -> { state, events }
//   serializeState(state, playerId) -> vista del jugador
// para que empezar una partida no rompa, mostrando un placeholder en el cliente.

/** Error de validación de jugada (mensaje legible para el cliente). */
export class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
  }
}

/**
 * Crea el estado inicial (mínimo) de una partida.
 * @param {{id:string, nickname:string}[]} players
 */
export function createGame(players) {
  const playerOrder = players.map((p) => p.id);
  return {
    phase: 'stub', // marca de Fase 1; el motor real lo sustituye en Fase 2
    status: 'playing',
    winner: null,
    playerOrder,
    currentPlayer: playerOrder[0] ?? null,
    players: Object.fromEntries(
      players.map((p) => [p.id, { id: p.id, nickname: p.nickname }]),
    ),
  };
}

/**
 * Aplica una acción de juego. En Fase 1 no hay reglas todavía.
 * @returns {{ state: object, events: object[] }}
 */
export function applyAction() {
  throw new GameError('El motor de reglas de Monopoly Deal llega en la Fase 2.');
}

/**
 * Vista del estado para un jugador concreto. En Fase 1 no hay manos ocultas que
 * filtrar; devolvemos una vista pública con la marca de placeholder.
 */
export function serializeState(state, _playerId) {
  if (!state) return null;
  return {
    phase: state.phase ?? 'stub',
    status: state.status,
    winner: state.winner ?? null,
    currentPlayer: state.currentPlayer ?? null,
    players: state.players ?? {},
  };
}

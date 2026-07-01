import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, serializeState, GameError } from '../../server/game/gameEngine.js';
import { buildDeck } from '../../server/game/deck.js';

const DECK = buildDeck();
const card = (id) => structuredClone(DECK.find((c) => c.id === id));
const money = (v, i = 1) => card(`money_${v}_${i}`);

const PLAYERS = [
  { id: 'A', nickname: 'Ana' },
  { id: 'B', nickname: 'Ben' },
];

/** Pila de propiedades completa para un grupo, con cartas reales. */
function completePile(...ids) {
  return { cards: ids.map((id) => ({ ...card(id), assignedGroup: card(id).group })), house: false, hotel: false };
}

test('createGame reparte 5 a cada uno y el primero roba 2 (7 en mano)', () => {
  const s = createGame(PLAYERS, { seed: 1 });
  assert.equal(s.currentPlayer, 'A');
  assert.equal(s.hands.A.length, 7); // 5 repartidas + 2 al empezar turno
  assert.equal(s.hands.B.length, 5);
  assert.equal(s.cardsPlayedThisTurn, 0);
});

test('no se puede bancar una propiedad', () => {
  const s = createGame(PLAYERS, { seed: 1 });
  s.hands.A = [card('property_brown_1'), money(1)];
  assert.throws(() => applyAction(s, { type: 'playMoney', cardId: 'property_brown_1' }, 'A'), GameError);
});

test('límite de 3 jugadas por turno', () => {
  const s = createGame(PLAYERS, { seed: 1 });
  s.hands.A = [money(1, 1), money(1, 2), money(1, 3), money(1, 4)];
  let cur = s;
  cur = applyAction(cur, { type: 'playMoney', cardId: 'money_1_1' }, 'A').state;
  cur = applyAction(cur, { type: 'playMoney', cardId: 'money_1_2' }, 'A').state;
  cur = applyAction(cur, { type: 'playMoney', cardId: 'money_1_3' }, 'A').state;
  assert.equal(cur.cardsPlayedThisTurn, 3);
  assert.throws(() => applyAction(cur, { type: 'playMoney', cardId: 'money_1_4' }, 'A'), /3 cartas/);
});

test('colocar propiedades completa un set y lo cuenta', () => {
  const s = createGame(PLAYERS, { seed: 1 });
  s.hands.A = [card('property_brown_1'), card('property_brown_2')];
  let cur = applyAction(s, { type: 'playProperty', cardId: 'property_brown_1' }, 'A').state;
  assert.equal(serializeState(cur, 'A').players[0].setsComplete, 0);
  cur = applyAction(cur, { type: 'playProperty', cardId: 'property_brown_2' }, 'A').state;
  const view = serializeState(cur, 'A');
  assert.equal(view.players[0].setsComplete, 1);
  assert.equal(view.players[0].properties.brown.complete, true);
});

test('un comodín debe indicar color y respeta sus colores permitidos', () => {
  const s = createGame(PLAYERS, { seed: 1 });
  const w = DECK.find((c) => c.type === 'wild' && Array.isArray(c.groups));
  s.hands.A = [structuredClone(w)];
  assert.throws(() => applyAction(s, { type: 'playProperty', cardId: w.id }, 'A'), /Elige a qué color/);
  const bad = Object.keys({ brown: 1, lightblue: 1, pink: 1 }).find((g) => !w.groups.includes(g));
  assert.throws(() => applyAction(s, { type: 'playProperty', cardId: w.id, group: bad }, 'A'), /no puede ir/);
  const ok = applyAction(s, { type: 'playProperty', cardId: w.id, group: w.groups[0] }, 'A').state;
  assert.equal(ok.properties.A[w.groups[0]].cards.length, 1);
});

test('completar el tercer set gana la partida', () => {
  // Estado hecho a mano: A ya tiene 2 sets completos y una utility suelta.
  const s = {
    playerOrder: ['A', 'B'],
    players: { A: { id: 'A', nickname: 'Ana' }, B: { id: 'B', nickname: 'Ben' } },
    hands: { A: [card('property_utility_2')], B: [] },
    banks: { A: [], B: [] },
    properties: {
      A: {
        brown: completePile('property_brown_1', 'property_brown_2'),
        darkblue: completePile('property_darkblue_1', 'property_darkblue_2'),
        utility: { cards: [{ ...card('property_utility_1'), assignedGroup: 'utility' }], house: false, hotel: false },
      },
      B: {},
    },
    deck: [], discard: [], turnIndex: 0, currentPlayer: 'A', cardsPlayedThisTurn: 0,
    status: 'playing', winner: null, pending: null, log: [], logSeq: 0, rngSeed: 1, reshuffleCount: 0,
  };
  const { state, events } = applyAction(s, { type: 'playProperty', cardId: 'property_utility_2' }, 'A');
  assert.equal(state.status, 'finished');
  assert.equal(state.winner, 'A');
  assert.ok(events.some((e) => e.type === 'victory' && e.playerId === 'A'));
});

test('terminar turno exige descartar por encima de 7 y pasa el turno', () => {
  const s = createGame(PLAYERS, { seed: 1 });
  s.hands.A = Array.from({ length: 9 }, (_, i) => money(1, ((i % 6) + 1))).map((c, i) => ({ ...c, id: `m${i}` }));
  assert.throws(() => applyAction(s, { type: 'endTurn' }, 'A'), /descarta 2/);
  const { state } = applyAction(s, { type: 'endTurn', discardIds: ['m0', 'm1'] }, 'A');
  assert.equal(state.currentPlayer, 'B');
  assert.equal(state.hands.A.length, 7);
});

test('no es tu turno', () => {
  const s = createGame(PLAYERS, { seed: 1 });
  assert.throws(() => applyAction(s, { type: 'playMoney', cardId: 'x' }, 'B'), /No es tu turno/);
});

test('serializeState oculta la mano ajena', () => {
  const s = createGame(PLAYERS, { seed: 1 });
  const viewB = serializeState(s, 'B');
  assert.equal(viewB.you.id, 'B');
  assert.equal(viewB.you.hand.length, 5);
  // Desde la vista de B, la mano de A solo expone el número de cartas.
  assert.equal(viewB.players[0].handCount, 7);
  assert.ok(!('hand' in viewB.players[0]));
});

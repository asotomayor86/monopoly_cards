import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, serializeState, GameError } from '../../server/game/gameEngine.js';
import { buildDeck } from '../../server/game/deck.js';

const DECK = buildDeck();
const card = (id) => structuredClone(DECK.find((c) => c.id === id));
const money = (v, i = 1) => card(`money_${v}_${i}`);
const actionCard = (a) => structuredClone(DECK.find((c) => c.action === a));

const P2 = [
  { id: 'A', nickname: 'Ana' },
  { id: 'B', nickname: 'Ben' },
];
const P3 = [...P2, { id: 'C', nickname: 'Cid' }];

function propPile(...ids) {
  return { cards: ids.map((id) => ({ ...card(id), assignedGroup: card(id).group })), house: false, hotel: false };
}

test('Pasa por la Salida roba 2 y cuenta como una jugada', () => {
  const s = createGame(P2, { seed: 1 });
  const pass = actionCard('pass_go');
  s.hands.A = [pass];
  const { state } = applyAction(s, { type: 'playAction', cardId: pass.id }, 'A');
  assert.equal(state.hands.A.length, 2); // -1 jugada +2 robadas
  assert.equal(state.cardsPlayedThisTurn, 1);
  assert.equal(state.discard.at(-1).id, pass.id);
});

test('Cobrador: el objetivo paga 5 M desde su banco al cobrador', () => {
  const s = createGame(P2, { seed: 1 });
  const debt = actionCard('debt_collector');
  s.hands.A = [debt];
  s.banks.B = [money(5), money(1)]; // patrimonio 6
  const r1 = applyAction(s, { type: 'playAction', cardId: debt.id, targetId: 'B' }, 'A');
  assert.equal(r1.state.pending.kind, 'payment');
  assert.deepEqual(serializeState(r1.state, 'A').pending.debtors, ['B']);
  // B paga con el billete de 5
  const r2 = applyAction(r1.state, { type: 'pay', cardIds: ['money_5_1'] }, 'B');
  assert.equal(r2.state.pending, null);
  assert.equal(r2.state.banks.B.length, 1); // le queda el de 1
  assert.ok(r2.state.banks.A.some((c) => c.id === 'money_5_1'));
});

test('el que no debe no puede pagar; el cobrador no continúa hasta cobrar', () => {
  const s = createGame(P2, { seed: 1 });
  const debt = actionCard('debt_collector');
  s.hands.A = [debt];
  s.banks.B = [money(5)];
  const { state } = applyAction(s, { type: 'playAction', cardId: debt.id, targetId: 'B' }, 'A');
  assert.throws(() => applyAction(state, { type: 'pay', cardIds: [] }, 'A'), /No te toca pagar/);
  assert.throws(() => applyAction(state, { type: 'playMoney', cardId: 'x' }, 'A'), GameError);
});

test('¡Es mi cumpleaños! cobra 2 M a cada rival', () => {
  const s = createGame(P3, { seed: 2 });
  const bday = actionCard('birthday');
  s.hands.A = [bday];
  s.banks.B = [money(2)];
  s.banks.C = [money(3)];
  let cur = applyAction(s, { type: 'playAction', cardId: bday.id }, 'A').state;
  assert.deepEqual(new Set(serializeState(cur, 'A').pending.debtors), new Set(['B', 'C']));
  cur = applyAction(cur, { type: 'pay', cardIds: ['money_2_1'] }, 'B').state;
  assert.equal(cur.pending.kind, 'payment'); // aún falta C
  cur = applyAction(cur, { type: 'pay', cardIds: ['money_3_1'] }, 'C').state;
  assert.equal(cur.pending, null);
  // A recibió 2 + 3 = 5 en el banco
  assert.equal(cur.banks.A.reduce((n, c) => n + c.value, 0), 5);
});

test('sin fondos suficientes se entrega todo lo que se tiene', () => {
  const s = createGame(P2, { seed: 1 });
  const debt = actionCard('debt_collector');
  s.hands.A = [debt];
  s.banks.B = [money(1)]; // solo 1, debe 5
  const r1 = applyAction(s, { type: 'playAction', cardId: debt.id, targetId: 'B' }, 'A');
  // pagar con menos de lo debido pero es TODO lo que tiene -> válido
  const r2 = applyAction(r1.state, { type: 'pay', cardIds: ['money_1_1'] }, 'B');
  assert.equal(r2.state.pending, null);
  assert.equal(r2.state.banks.B.length, 0);
  // y no puede "guardarse" cartas si aún le queda patrimonio y no cubre
  const s2 = createGame(P2, { seed: 1 });
  s2.hands.A = [actionCard('debt_collector')];
  s2.banks.B = [money(5), money(1)];
  const p = applyAction(s2, { type: 'playAction', cardId: s2.hands.A[0].id, targetId: 'B' }, 'A').state;
  assert.throws(() => applyAction(p, { type: 'pay', cardIds: ['money_1_1'] }, 'B'), /Debes pagar 5/);
});

test('Alquiler (par de colores) cobra a todos por el color indicado', () => {
  const s = createGame(P3, { seed: 3 });
  const rent = DECK.find((c) => c.type === 'rent' && Array.isArray(c.groups) && c.groups.includes('brown'));
  s.hands.A = [structuredClone(rent)];
  s.properties.A = { brown: propPile('property_brown_1', 'property_brown_2') }; // set completo -> alquiler 2
  s.banks.B = [money(2)];
  s.banks.C = [money(2)];
  let cur = applyAction(s, { type: 'playAction', cardId: rent.id, group: 'brown' }, 'A').state;
  assert.equal(cur.pending.amount, 2);
  assert.deepEqual(new Set(cur.pending.debts && Object.keys(cur.pending.debts)), new Set(['B', 'C']));
  cur = applyAction(cur, { type: 'pay', cardIds: ['money_2_1'] }, 'B').state;
  cur = applyAction(cur, { type: 'pay', cardIds: ['money_2_1'] }, 'C').state;
  assert.equal(cur.pending, null);
  assert.equal(cur.banks.A.reduce((n, c) => n + c.value, 0), 4);
});

test('se puede pagar con una propiedad, que pasa al cobrador', () => {
  const s = createGame(P2, { seed: 1 });
  const debt = actionCard('debt_collector');
  s.hands.A = [debt];
  s.banks.B = [];
  s.properties.B = { green: propPile('property_green_1') }; // una verde (valor 4)
  const r1 = applyAction(s, { type: 'playAction', cardId: debt.id, targetId: 'B' }, 'A');
  const r2 = applyAction(r1.state, { type: 'pay', cardIds: ['property_green_1'] }, 'B');
  assert.equal(r2.state.pending, null);
  assert.equal(Object.keys(r2.state.properties.B).length, 0); // B ya no tiene la verde
  assert.ok(r2.state.properties.A.green?.cards.some((c) => c.id === 'property_green_1'));
});

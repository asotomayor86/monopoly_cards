import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, serializeState, GameError } from '../../server/game/gameEngine.js';
import { buildDeck } from '../../server/game/deck.js';

const DECK = buildDeck();
const card = (id) => structuredClone(DECK.find((c) => c.id === id));
const money = (v, i = 1) => card(`money_${v}_${i}`);
const jsn = (i) => structuredClone(DECK.find((c) => c.id === `action_just_say_no_${i}`));

const P2 = [
  { id: 'A', nickname: 'Ana' },
  { id: 'B', nickname: 'Ben' },
];

function pile(complete, ...ids) {
  return { cards: ids.map((id) => ({ ...card(id), assignedGroup: card(id).group })), house: false, hotel: false };
}
function newGame() {
  const s = createGame(P2, { seed: 1 });
  s.hands.A = [];
  s.hands.B = [];
  return s;
}

test('Robo: sin ¡Ni Hablar! del rival, la propiedad se roba al instante', () => {
  const s = newGame();
  const sly = card('action_sly_deal_1');
  s.hands.A = [sly];
  s.properties.B = { green: pile(false, 'property_green_1') }; // suelta (set de 3)
  const { state } = applyAction(s, { type: 'playAction', cardId: sly.id, targetId: 'B', propertyId: 'property_green_1' }, 'A');
  assert.equal(state.pending, null);
  assert.equal(Object.keys(state.properties.B).length, 0);
  assert.ok(state.properties.A.green.cards.some((c) => c.id === 'property_green_1'));
});

test('Robo anulado con ¡Ni Hablar! del rival', () => {
  const s = newGame();
  const sly = card('action_sly_deal_1');
  s.hands.A = [sly];
  s.hands.B = [jsn(2)];
  s.properties.B = { green: pile(false, 'property_green_1') };
  const r1 = applyAction(s, { type: 'playAction', cardId: sly.id, targetId: 'B', propertyId: 'property_green_1' }, 'A');
  assert.equal(r1.state.pending.kind, 'response');
  assert.equal(serializeState(r1.state, 'B').pending.awaiting, 'B');
  const r2 = applyAction(r1.state, { type: 'sayNo' }, 'B');
  assert.equal(r2.state.pending, null);
  assert.ok(r2.state.properties.B.green, 'B conserva su propiedad');
  assert.equal(r2.state.properties.A.green, undefined);
});

test('Robo con contra-¡Ni Hablar!: el ladrón responde y roba igual', () => {
  const s = newGame();
  const sly = card('action_sly_deal_1');
  s.hands.A = [sly, jsn(1)];
  s.hands.B = [jsn(2)];
  s.properties.B = { green: pile(false, 'property_green_1') };
  let cur = applyAction(s, { type: 'playAction', cardId: sly.id, targetId: 'B', propertyId: 'property_green_1' }, 'A').state;
  cur = applyAction(cur, { type: 'sayNo' }, 'B').state; // B anula -> espera A
  assert.equal(cur.pending.awaiting, 'A');
  cur = applyAction(cur, { type: 'sayNo' }, 'A').state; // A contra-anula -> B sin JSN -> se aplica
  assert.equal(cur.pending, null);
  assert.ok(cur.properties.A.green.cards.some((c) => c.id === 'property_green_1'));
});

test('no se puede robar de un set completo', () => {
  const s = newGame();
  s.hands.A = [card('action_sly_deal_1')];
  s.properties.B = { brown: pile(true, 'property_brown_1', 'property_brown_2') }; // completo
  assert.throws(
    () => applyAction(s, { type: 'playAction', cardId: 'action_sly_deal_1', targetId: 'B', propertyId: 'property_brown_1' }, 'A'),
    /set completo/,
  );
});

test('Trato Forzoso intercambia dos propiedades sueltas', () => {
  const s = newGame();
  s.hands.A = [card('action_forced_deal_1')];
  s.properties.A = { red: pile(false, 'property_red_1') };
  s.properties.B = { lightblue: pile(false, 'property_lightblue_1') };
  const { state } = applyAction(s, {
    type: 'playAction', cardId: 'action_forced_deal_1', targetId: 'B',
    myCardId: 'property_red_1', theirCardId: 'property_lightblue_1',
  }, 'A');
  assert.ok(state.properties.A.lightblue.cards.some((c) => c.id === 'property_lightblue_1'));
  assert.ok(state.properties.B.red.cards.some((c) => c.id === 'property_red_1'));
});

test('Trato Directo roba un set completo', () => {
  const s = newGame();
  s.hands.A = [card('action_deal_breaker_1')];
  s.properties.B = { brown: pile(true, 'property_brown_1', 'property_brown_2') };
  const { state } = applyAction(s, { type: 'playAction', cardId: 'action_deal_breaker_1', targetId: 'B', group: 'brown' }, 'A');
  assert.equal(state.properties.B.brown, undefined);
  assert.equal(state.properties.A.brown.cards.length, 2);
  assert.equal(serializeState(state, 'A').players[0].setsComplete, 1);
});

test('Casa y Hotel suben el alquiler; reglas de construcción', () => {
  const s = newGame();
  s.properties.A = { green: pile(true, 'property_green_1', 'property_green_2', 'property_green_3') };
  s.hands.A = [card('action_house_1'), card('action_hotel_1')];
  let cur = applyAction(s, { type: 'playAction', cardId: 'action_house_1', group: 'green' }, 'A').state;
  assert.equal(cur.properties.A.green.house, true);
  cur = applyAction(cur, { type: 'playAction', cardId: 'action_hotel_1', group: 'green' }, 'A').state;
  assert.equal(cur.properties.A.green.hotel, true);
  // hotel antes que casa, y casa sobre set incompleto o estaciones -> error
  const s2 = newGame();
  s2.properties.A = { green: pile(true, 'property_green_1', 'property_green_2', 'property_green_3') };
  s2.hands.A = [card('action_hotel_1')];
  assert.throws(() => applyAction(s2, { type: 'playAction', cardId: 'action_hotel_1', group: 'green' }, 'A'), /Necesitas una casa/);
});

test('no se puede construir en estaciones', () => {
  const s = newGame();
  s.properties.A = { railroad: pile(true, 'property_railroad_1', 'property_railroad_2', 'property_railroad_3', 'property_railroad_4') };
  s.hands.A = [card('action_house_1')];
  assert.throws(() => applyAction(s, { type: 'playAction', cardId: 'action_house_1', group: 'railroad' }, 'A'), /estaciones/);
});

test('Doble Alquiler duplica el importe y gasta dos jugadas', () => {
  const s = newGame();
  const rent = DECK.find((c) => c.type === 'rent' && Array.isArray(c.groups) && c.groups.includes('brown'));
  const dbl = card('action_double_rent_1');
  s.hands.A = [structuredClone(rent), dbl];
  s.properties.A = { brown: pile(true, 'property_brown_1', 'property_brown_2') }; // alquiler base 2
  s.banks.B = [money(5), money(3)];
  const { state } = applyAction(s, {
    type: 'playAction', cardId: rent.id, group: 'brown', doubleRentCardId: dbl.id,
  }, 'A');
  assert.equal(state.pending.amount, 4); // 2 x2
  assert.equal(state.cardsPlayedThisTurn, 2);
});

test('¡Ni Hablar! no se puede jugar suelto', () => {
  const s = newGame();
  s.hands.A = [jsn(1)];
  assert.throws(() => applyAction(s, { type: 'playAction', cardId: 'action_just_say_no_1' }, 'A'), GameError);
});

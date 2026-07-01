import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck, shuffle, seededRng } from '../../server/game/deck.js';
import { CARD_TYPE, PROPERTY_GROUPS } from '../../shared/constants.js';

const deck = buildDeck();
const byType = (t) => deck.filter((c) => c.type === t);

test('la baraja tiene 106 cartas jugables', () => {
  assert.equal(deck.length, 106);
});

test('reparto por tipo (20 dinero, 28 propiedad, 11 comodín, 13 alquiler, 34 acción)', () => {
  assert.equal(byType(CARD_TYPE.MONEY).length, 20);
  assert.equal(byType(CARD_TYPE.PROPERTY).length, 28);
  assert.equal(byType(CARD_TYPE.WILD).length, 11);
  assert.equal(byType(CARD_TYPE.RENT).length, 13);
  assert.equal(byType(CARD_TYPE.ACTION).length, 34);
});

test('los ids son únicos', () => {
  const ids = new Set(deck.map((c) => c.id));
  assert.equal(ids.size, deck.length);
});

test('las propiedades cubren cada grupo con sus calles', () => {
  for (const [group, def] of Object.entries(PROPERTY_GROUPS)) {
    const props = deck.filter((c) => c.type === CARD_TYPE.PROPERTY && c.group === group);
    assert.equal(props.length, def.streets.length, `grupo ${group}`);
    for (const street of def.streets) {
      assert.ok(props.some((c) => c.name === street), `falta ${street}`);
    }
  }
});

test('los valores de dinero suman lo esperado', () => {
  const money = byType(CARD_TYPE.MONEY);
  const total = money.reduce((s, c) => s + c.value, 0);
  // 6·1 + 5·2 + 3·3 + 3·4 + 2·5 + 1·10 = 57
  assert.equal(total, 57);
});

test('el comodín multicolor no tiene valor de banco', () => {
  const multi = deck.filter((c) => c.type === CARD_TYPE.WILD && c.groups === 'any');
  assert.equal(multi.length, 2);
  assert.ok(multi.every((c) => c.value === 0));
});

test('todas las cartas de acción llevan un tipo de acción y valor de banco', () => {
  for (const c of byType(CARD_TYPE.ACTION)) {
    assert.ok(c.action, `acción sin tipo: ${c.id}`);
    assert.ok(c.value >= 1, `acción sin valor: ${c.id}`);
  }
});

test('shuffle con el mismo seed es determinista y conserva las cartas', () => {
  const a = shuffle(buildDeck(), seededRng(42));
  const b = shuffle(buildDeck(), seededRng(42));
  assert.deepEqual(a.map((c) => c.id), b.map((c) => c.id));
  assert.equal(a.length, 106);
  assert.deepEqual(new Set(a.map((c) => c.id)), new Set(deck.map((c) => c.id)));
});

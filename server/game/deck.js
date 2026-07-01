import { CARD_TYPE, ACTION, PROPERTY_GROUPS } from '../../shared/constants.js';

// Baraja de Monopoly Deal: 106 cartas jugables (la caja trae además 4 cartas de
// "inicio rápido" que son de referencia y no entran en el mazo).
//
// Composición oficial (edición inglesa):
//   Dinero 20 · Propiedades 28 · Comodines 11 · Alquiler 13 · Acción 34 = 106
//
// Cada carta lleva `value` = su valor en millones si se juega al banco. El comodín
// multicolor no tiene valor (no se puede bancar; solo vale como propiedad).

// --- Comodines de propiedad (11): pares de color + 2 multicolor ---
const WILDCARDS = [
  { groups: ['darkblue', 'green'], value: 4, copies: 1 },
  { groups: ['green', 'railroad'], value: 4, copies: 1 },
  { groups: ['utility', 'railroad'], value: 2, copies: 1 },
  { groups: ['lightblue', 'railroad'], value: 4, copies: 1 },
  { groups: ['lightblue', 'brown'], value: 1, copies: 1 },
  { groups: ['pink', 'orange'], value: 2, copies: 2 },
  { groups: ['red', 'yellow'], value: 3, copies: 2 },
  { groups: 'any', value: 0, copies: 2 }, // multicolor: vale para cualquier grupo
];

// --- Cartas de alquiler (13): 5 pares de color ×2 + 3 comodín ---
const RENTS = [
  { groups: ['brown', 'lightblue'], value: 1, copies: 2 },
  { groups: ['pink', 'orange'], value: 1, copies: 2 },
  { groups: ['red', 'yellow'], value: 1, copies: 2 },
  { groups: ['green', 'darkblue'], value: 1, copies: 2 },
  { groups: ['railroad', 'utility'], value: 1, copies: 2 },
  { groups: 'any', value: 3, copies: 3 }, // alquiler comodín: cobra a UN jugador
];

// --- Dinero (20) ---
const MONEY = [
  { value: 1, copies: 6 },
  { value: 2, copies: 5 },
  { value: 3, copies: 3 },
  { value: 4, copies: 3 },
  { value: 5, copies: 2 },
  { value: 10, copies: 1 },
];

// --- Acción (34) --- `value` = valor de banco impreso en la carta.
const ACTIONS = [
  { action: ACTION.PASS_GO, name: 'Pasa por la Salida', value: 1, copies: 10 },
  { action: ACTION.JUST_SAY_NO, name: '¡Ni Hablar!', value: 4, copies: 3 },
  { action: ACTION.SLY_DEAL, name: 'Robo', value: 3, copies: 3 },
  { action: ACTION.FORCED_DEAL, name: 'Trato Forzoso', value: 3, copies: 3 },
  { action: ACTION.DEAL_BREAKER, name: 'Trato Directo', value: 5, copies: 2 },
  { action: ACTION.DEBT_COLLECTOR, name: 'Cobrador', value: 3, copies: 3 },
  { action: ACTION.ITS_MY_BIRTHDAY, name: '¡Es mi cumpleaños!', value: 2, copies: 3 },
  { action: ACTION.DOUBLE_RENT, name: 'Doble Alquiler', value: 1, copies: 2 },
  { action: ACTION.HOUSE, name: 'Casa', value: 3, copies: 3 },
  { action: ACTION.HOTEL, name: 'Hotel', value: 4, copies: 2 },
];

function groupLabel(key) {
  return PROPERTY_GROUPS[key]?.label ?? key;
}

/** Nombre legible de un par de grupos (o "comodín" para 'any'). */
function pairName(groups) {
  if (groups === 'any') return 'comodín';
  return groups.map(groupLabel).join('/');
}

/** Construye la baraja completa ordenada (106 cartas). */
export function buildDeck() {
  const cards = [];
  const push = (card) => cards.push({ imageUrl: null, ...card });

  // Propiedades: una carta por calle de cada grupo (usa el catálogo español).
  for (const [group, def] of Object.entries(PROPERTY_GROUPS)) {
    def.streets.forEach((street, i) => {
      push({
        id: `property_${group}_${i + 1}`,
        type: CARD_TYPE.PROPERTY,
        name: street,
        group,
        value: def.value,
      });
    });
  }

  // Comodines de propiedad.
  WILDCARDS.forEach((w, wi) => {
    for (let i = 1; i <= w.copies; i++) {
      const slug = w.groups === 'any' ? 'any' : w.groups.join('-');
      push({
        id: `wild_${slug}_${wi}_${i}`,
        type: CARD_TYPE.WILD,
        name: w.groups === 'any' ? 'Comodín multicolor' : `Comodín ${pairName(w.groups)}`,
        groups: w.groups,
        value: w.value,
      });
    }
  });

  // Alquiler.
  RENTS.forEach((r, ri) => {
    for (let i = 1; i <= r.copies; i++) {
      const slug = r.groups === 'any' ? 'any' : r.groups.join('-');
      push({
        id: `rent_${slug}_${ri}_${i}`,
        type: CARD_TYPE.RENT,
        name: r.groups === 'any' ? 'Alquiler comodín' : `Alquiler ${pairName(r.groups)}`,
        groups: r.groups,
        value: r.value,
      });
    }
  });

  // Dinero.
  MONEY.forEach((m) => {
    for (let i = 1; i <= m.copies; i++) {
      push({
        id: `money_${m.value}_${i}`,
        type: CARD_TYPE.MONEY,
        name: `${m.value} M`,
        value: m.value,
      });
    }
  });

  // Acción.
  ACTIONS.forEach((a) => {
    for (let i = 1; i <= a.copies; i++) {
      push({
        id: `action_${a.action}_${i}`,
        type: CARD_TYPE.ACTION,
        name: a.name,
        action: a.action,
        value: a.value,
      });
    }
  });

  return cards;
}

/**
 * Baraja in-place (Fisher-Yates) con un RNG inyectable. Por defecto Math.random;
 * los tests pasan uno sembrado para reproducibilidad.
 */
export function shuffle(cards, rng = Math.random) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/** Generador pseudoaleatorio determinista (mulberry32) para tests reproducibles. */
export function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

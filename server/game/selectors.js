import { CARD_TYPE, PROPERTY_GROUPS, SETS_TO_WIN } from '../../shared/constants.js';

// Helpers puros de consulta sobre el estado. Sin efectos secundarios.

/** ¿A qué grupos puede asignarse una carta de propiedad/comodín? */
export function allowedGroups(card) {
  if (card.type === CARD_TYPE.PROPERTY) return [card.group];
  if (card.type === CARD_TYPE.WILD) {
    return card.groups === 'any' ? Object.keys(PROPERTY_GROUPS) : [...card.groups];
  }
  return [];
}

/** ¿Puede una carta guardarse en el banco (como dinero)? Propiedades y comodines no. */
export function isBankable(card) {
  return (
    card.type === CARD_TYPE.MONEY ||
    card.type === CARD_TYPE.ACTION ||
    card.type === CARD_TYPE.RENT
  );
}

/** Nº de propiedades necesarias para completar un grupo. */
export function setSize(group) {
  return PROPERTY_GROUPS[group].setSize;
}

/** Pila de propiedades de un jugador para un grupo (crea la estructura si falta). */
export function groupPile(state, playerId, group) {
  return state.properties[playerId]?.[group] ?? null;
}

/** ¿Está completo el grupo (tiene tantas cartas como su setSize)? */
export function isGroupComplete(pile, group) {
  if (!pile) return false;
  return pile.cards.length >= setSize(group);
}

/**
 * Un grupo completo cuenta como set salvo que esté formado SOLO por comodines
 * multicolor (regla oficial: no puedes ganar con un set solo de comodines).
 */
function countsAsSet(pile, group) {
  if (!isGroupComplete(pile, group)) return false;
  const hasReal = pile.cards.some(
    (c) => c.type === CARD_TYPE.PROPERTY || (c.type === CARD_TYPE.WILD && c.groups !== 'any'),
  );
  return hasReal;
}

/** Nº de sets completos (de colores distintos) que tiene un jugador. */
export function countCompleteSets(state, playerId) {
  const props = state.properties[playerId] || {};
  let n = 0;
  for (const [group, pile] of Object.entries(props)) {
    if (countsAsSet(pile, group)) n++;
  }
  return n;
}

/** ¿Ha ganado el jugador (SETS_TO_WIN sets completos)? */
export function hasWon(state, playerId) {
  return countCompleteSets(state, playerId) >= SETS_TO_WIN;
}

/** Valor total del banco de un jugador (millones). */
export function bankValue(state, playerId) {
  return (state.banks[playerId] || []).reduce((s, c) => s + (c.value || 0), 0);
}

/** Alquiler base de un grupo según cuántas propiedades tenga la pila (con casa/hotel). */
export function rentFor(pile, group) {
  if (!pile || pile.cards.length === 0) return 0;
  const scale = PROPERTY_GROUPS[group].rent;
  const n = Math.min(pile.cards.length, scale.length);
  let rent = scale[n - 1];
  if (isGroupComplete(pile, group)) {
    if (pile.house) rent += 3;
    if (pile.hotel) rent += 4;
  }
  return rent;
}

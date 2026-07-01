import { CARD_TYPE } from '../../shared/constants.js';
import { buildDeck, shuffle, seededRng } from './deck.js';
import { ACTION } from '../../shared/constants.js';
import {
  allowedGroups,
  isBankable,
  isGroupComplete,
  countCompleteSets,
  hasWon,
  bankValue,
  rentFor,
} from './selectors.js';

const INITIAL_DEAL = 5;
const DRAW_PER_TURN = 2;
const DRAW_EMPTY_HAND = 5;
const MAX_PLAYS = 3;
const HAND_LIMIT = 7;

/** Error de validación de jugada (mensaje legible para el cliente). */
export class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
  }
}

// ---------------------------------------------------------------------------
// Creación de partida
// ---------------------------------------------------------------------------

/**
 * Crea el estado inicial. Reparte 5 cartas a cada jugador y empieza el turno del
 * primero (robando sus 2 cartas).
 * @param {{id:string, nickname:string}[]} players
 * @param {{seed?:number, deck?:object[]}} [opts]
 */
export function createGame(players, opts = {}) {
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const rng = seededRng(seed);
  const playerOrder = players.map((p) => p.id);
  const deck = opts.deck ? [...opts.deck] : shuffle(buildDeck(), rng);

  const state = {
    playerOrder,
    players: Object.fromEntries(players.map((p) => [p.id, { id: p.id, nickname: p.nickname }])),
    hands: Object.fromEntries(players.map((p) => [p.id, []])),
    banks: Object.fromEntries(players.map((p) => [p.id, []])),
    properties: Object.fromEntries(players.map((p) => [p.id, {}])),
    deck,
    discard: [],
    turnIndex: 0,
    currentPlayer: playerOrder[0],
    cardsPlayedThisTurn: 0,
    status: 'playing',
    winner: null,
    pending: null,
    log: [],
    logSeq: 0,
    rngSeed: seed,
    reshuffleCount: 0,
  };

  // Reparto inicial: 5 cartas a cada jugador.
  for (let i = 0; i < INITIAL_DEAL; i++) {
    for (const id of playerOrder) state.hands[id].push(draw(state));
  }
  beginTurn(state, playerOrder[0]);
  return state;
}

// ---------------------------------------------------------------------------
// Punto de entrada del motor
// ---------------------------------------------------------------------------

/**
 * Aplica una acción y devuelve { state, events }. Función pura: no muta el
 * estado recibido. Lanza GameError si la acción no es válida.
 */
export function applyAction(prevState, action, playerId) {
  const state = structuredClone(prevState);
  const events = [];

  if (state.status === 'finished') throw new GameError('La partida ya ha terminado.');

  // Ventanas pendientes (pagos, ¡Ni Hablar!) se resuelven en las capas 2b/2c.
  if (state.pending) return handlePending(state, action, playerId, events);

  switch (action.type) {
    case 'playMoney':
      return handlePlayMoney(state, action, playerId, events);
    case 'playProperty':
      return handlePlayProperty(state, action, playerId, events);
    case 'moveWild':
      return handleMoveWild(state, action, playerId, events);
    case 'playAction':
      return handlePlayAction(state, action, playerId, events);
    case 'endTurn':
      return handleEndTurn(state, action, playerId, events);
    default:
      throw new GameError('Acción no reconocida.');
  }
}

// ---------------------------------------------------------------------------
// Helpers de mazo / mano / turno
// ---------------------------------------------------------------------------

function log(state, events, text) {
  const entry = { seq: ++state.logSeq, text };
  state.log.push(entry);
  events.push({ type: 'log', ...entry });
}

function name(state, playerId) {
  return state.players[playerId]?.nickname || '¿?';
}

/** Roba una carta del mazo; rebaraja el descarte si se agota. Devuelve la carta o null. */
function draw(state) {
  if (state.deck.length === 0) {
    if (state.discard.length === 0) return null;
    state.reshuffleCount += 1;
    state.deck = shuffle(state.discard, seededRng(state.rngSeed + state.reshuffleCount));
    state.discard = [];
  }
  return state.deck.shift() ?? null;
}

function takeFromHand(state, playerId, cardId) {
  const hand = state.hands[playerId];
  const idx = hand.findIndex((c) => c.id === cardId);
  if (idx === -1) throw new GameError('No tienes esa carta en la mano.');
  return hand.splice(idx, 1)[0];
}

function requireTurn(state, playerId) {
  if (playerId !== state.currentPlayer) throw new GameError('No es tu turno.');
}

function requirePlaysLeft(state) {
  if (state.cardsPlayedThisTurn >= MAX_PLAYS) {
    throw new GameError(`Ya has jugado ${MAX_PLAYS} cartas este turno.`);
  }
}

/** Empieza el turno de `playerId`: roba 2 (o 5 si no tiene cartas) y resetea el contador. */
function beginTurn(state, playerId) {
  const count = state.hands[playerId].length === 0 ? DRAW_EMPTY_HAND : DRAW_PER_TURN;
  for (let i = 0; i < count; i++) {
    const c = draw(state);
    if (c) state.hands[playerId].push(c);
  }
  state.cardsPlayedThisTurn = 0;
}

function advanceTurn(state) {
  state.turnIndex = (state.turnIndex + 1) % state.playerOrder.length;
  state.currentPlayer = state.playerOrder[state.turnIndex];
  beginTurn(state, state.currentPlayer);
}

/** Estructura de la pila de un grupo para un jugador (la crea si no existe). */
function ensurePile(state, playerId, group) {
  const props = state.properties[playerId];
  if (!props[group]) props[group] = { cards: [], house: false, hotel: false };
  return props[group];
}

/** Comprueba victoria del jugador que acaba de actuar. */
function checkWin(state, playerId, events) {
  if (hasWon(state, playerId)) {
    state.status = 'finished';
    state.winner = playerId;
    log(state, events, `🏆 ${name(state, playerId)} gana con ${countCompleteSets(state, playerId)} sets completos.`);
    events.push({ type: 'victory', playerId });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Jugar carta al banco (dinero)
// ---------------------------------------------------------------------------

function handlePlayMoney(state, action, playerId, events) {
  requireTurn(state, playerId);
  requirePlaysLeft(state);
  const hand = state.hands[playerId];
  const card = hand.find((c) => c.id === action.cardId);
  if (!card) throw new GameError('No tienes esa carta en la mano.');
  if (!isBankable(card)) throw new GameError('Las propiedades no se pueden guardar en el banco.');

  takeFromHand(state, playerId, card.id);
  state.banks[playerId].push(card);
  state.cardsPlayedThisTurn += 1;
  log(state, events, `${name(state, playerId)} guarda ${card.name} en el banco (${card.value} M).`);
  return { state, events };
}

// ---------------------------------------------------------------------------
// Jugar carta como propiedad
// ---------------------------------------------------------------------------

function handlePlayProperty(state, action, playerId, events) {
  requireTurn(state, playerId);
  requirePlaysLeft(state);
  const hand = state.hands[playerId];
  const card = hand.find((c) => c.id === action.cardId);
  if (!card) throw new GameError('No tienes esa carta en la mano.');
  if (card.type !== CARD_TYPE.PROPERTY && card.type !== CARD_TYPE.WILD) {
    throw new GameError('Esa carta no es una propiedad.');
  }

  const allowed = allowedGroups(card);
  const group = card.type === CARD_TYPE.PROPERTY ? card.group : action.group;
  if (!group) throw new GameError('Elige a qué color asignar el comodín.');
  if (!allowed.includes(group)) throw new GameError('Ese comodín no puede ir a ese color.');

  takeFromHand(state, playerId, card.id);
  const pile = ensurePile(state, playerId, group);
  pile.cards.push({ ...card, assignedGroup: group });
  state.cardsPlayedThisTurn += 1;
  log(state, events, `${name(state, playerId)} coloca ${card.name} en ${group}.`);

  checkWin(state, playerId, events);
  return { state, events };
}

// ---------------------------------------------------------------------------
// Mover un comodín ya en juego a otro color (acción libre, no cuenta como jugada)
// ---------------------------------------------------------------------------

function handleMoveWild(state, action, playerId, events) {
  requireTurn(state, playerId);
  const { cardId, toGroup } = action;
  const props = state.properties[playerId];
  let found = null;
  let fromGroup = null;
  for (const [group, pile] of Object.entries(props)) {
    const idx = pile.cards.findIndex((c) => c.id === cardId);
    if (idx !== -1) {
      found = pile.cards[idx];
      fromGroup = group;
      break;
    }
  }
  if (!found) throw new GameError('No tienes ese comodín en juego.');
  if (found.type !== CARD_TYPE.WILD) throw new GameError('Solo se pueden mover los comodines.');
  if (!allowedGroups(found).includes(toGroup)) {
    throw new GameError('Ese comodín no puede ir a ese color.');
  }

  const fromPile = props[fromGroup];
  fromPile.cards = fromPile.cards.filter((c) => c.id !== cardId);
  // Al vaciarse un grupo, se pierde su casa/hotel (ya no es un set).
  if (fromPile.cards.length === 0) delete props[fromGroup];
  else if (!isGroupComplete(fromPile, fromGroup)) {
    fromPile.house = false;
    fromPile.hotel = false;
  }
  const toPile = ensurePile(state, playerId, toGroup);
  toPile.cards.push({ ...found, assignedGroup: toGroup });
  log(state, events, `${name(state, playerId)} mueve un comodín a ${toGroup}.`);
  checkWin(state, playerId, events);
  return { state, events };
}

// ---------------------------------------------------------------------------
// Jugar carta de acción por su efecto (capas 2b/2c)
// ---------------------------------------------------------------------------

/** Patrimonio total de un jugador (banco + valor de sus propiedades). */
function worthOf(state, playerId) {
  let w = bankValue(state, playerId);
  for (const pile of Object.values(state.properties[playerId] || {})) {
    for (const c of pile.cards) w += c.value || 0;
  }
  return w;
}

function handlePlayAction(state, action, playerId, events) {
  requireTurn(state, playerId);
  requirePlaysLeft(state);
  const hand = state.hands[playerId];
  const card = hand.find((c) => c.id === action.cardId);
  if (!card) throw new GameError('No tienes esa carta en la mano.');
  if (card.type !== CARD_TYPE.ACTION && card.type !== CARD_TYPE.RENT) {
    throw new GameError('Esa carta no es de acción.');
  }
  if (card.type === CARD_TYPE.RENT) return playRent(state, action, playerId, card, events);

  switch (card.action) {
    case ACTION.PASS_GO: {
      takeFromHand(state, playerId, card.id);
      state.discard.push(card);
      state.cardsPlayedThisTurn += 1;
      for (let i = 0; i < 2; i++) {
        const c = draw(state);
        if (c) state.hands[playerId].push(c);
      }
      log(state, events, `${name(state, playerId)} roba 2 cartas (Pasa por la Salida).`);
      return { state, events };
    }
    case ACTION.ITS_MY_BIRTHDAY: {
      takeFromHand(state, playerId, card.id);
      state.discard.push(card);
      state.cardsPlayedThisTurn += 1;
      const debtors = state.playerOrder.filter((id) => id !== playerId);
      log(state, events, `🎂 ¡Es el cumpleaños de ${name(state, playerId)}! Cada jugador le da 2 M.`);
      return startCharge(state, playerId, debtors, 2, 'birthday', events);
    }
    case ACTION.DEBT_COLLECTOR: {
      const target = action.targetId;
      if (!target || target === playerId || !state.players[target]) {
        throw new GameError('Elige a quién cobrar.');
      }
      takeFromHand(state, playerId, card.id);
      state.discard.push(card);
      state.cardsPlayedThisTurn += 1;
      log(state, events, `${name(state, playerId)} cobra 5 M a ${name(state, target)} (Cobrador).`);
      return startCharge(state, playerId, [target], 5, 'debt', events);
    }
    case ACTION.HOUSE:
    case ACTION.HOTEL:
      return playHouseHotel(state, action, playerId, card, events);
    case ACTION.SLY_DEAL:
      return playSlyDeal(state, action, playerId, card, events);
    case ACTION.FORCED_DEAL:
      return playForcedDeal(state, action, playerId, card, events);
    case ACTION.DEAL_BREAKER:
      return playDealBreaker(state, action, playerId, card, events);
    case ACTION.DOUBLE_RENT:
      throw new GameError('Doble Alquiler se juega junto a una carta de Alquiler.');
    case ACTION.JUST_SAY_NO:
      throw new GameError('¡Ni Hablar! solo se juega como respuesta a una acción en tu contra.');
    default:
      throw new GameError('Acción no reconocida.');
  }
}

function requireTarget(state, playerId, targetId) {
  if (!targetId || targetId === playerId || !state.players[targetId]) {
    throw new GameError('Elige a un rival válido.');
  }
}

function handHasJSN(state, playerId) {
  return (state.hands[playerId] || []).some((c) => c.action === ACTION.JUST_SAY_NO);
}

// --- Casa / Hotel (sobre un set completo propio; sin respuesta) ---
function playHouseHotel(state, action, playerId, card, events) {
  const group = action.group;
  const pile = state.properties[playerId]?.[group];
  if (!pile || !isGroupComplete(pile, group)) {
    throw new GameError('Solo puedes construir sobre un set completo.');
  }
  if (group === 'railroad' || group === 'utility') {
    throw new GameError('No se pueden poner casas ni hoteles en estaciones ni compañías.');
  }
  if (card.action === ACTION.HOUSE) {
    if (pile.house) throw new GameError('Ese set ya tiene casa.');
    pile.house = true;
  } else {
    if (!pile.house) throw new GameError('Necesitas una casa antes del hotel.');
    if (pile.hotel) throw new GameError('Ese set ya tiene hotel.');
    pile.hotel = true;
  }
  takeFromHand(state, playerId, card.id);
  state.discard.push(card);
  state.cardsPlayedThisTurn += 1;
  log(state, events, `${name(state, playerId)} añade ${card.name} a ${group}.`);
  return { state, events };
}

// --- Robo (roba una propiedad suelta) ---
function playSlyDeal(state, action, playerId, card, events) {
  requireTarget(state, playerId, action.targetId);
  const loc = findAsset(state, action.targetId, action.propertyId);
  if (!loc || loc.where !== 'prop') throw new GameError('Esa propiedad no existe.');
  if (isGroupComplete(state.properties[action.targetId][loc.group], loc.group)) {
    throw new GameError('No puedes robar propiedades de un set completo.');
  }
  takeFromHand(state, playerId, card.id);
  state.discard.push(card);
  state.cardsPlayedThisTurn += 1;
  const effect = { type: 'sly', from: action.targetId, to: playerId, cardId: action.propertyId };
  return openResponse(state, effect, playerId, action.targetId, events,
    `${name(state, playerId)} intenta robar una propiedad a ${name(state, action.targetId)} (Robo).`);
}

// --- Trato Forzoso (intercambia una propiedad tuya por una suya) ---
function playForcedDeal(state, action, playerId, card, events) {
  requireTarget(state, playerId, action.targetId);
  const mine = findAsset(state, playerId, action.myCardId);
  if (!mine || mine.where !== 'prop') throw new GameError('Elige una propiedad tuya suelta.');
  if (isGroupComplete(state.properties[playerId][mine.group], mine.group)) {
    throw new GameError('No puedes dar propiedades de un set completo.');
  }
  const theirs = findAsset(state, action.targetId, action.theirCardId);
  if (!theirs || theirs.where !== 'prop') throw new GameError('Esa propiedad no existe.');
  if (isGroupComplete(state.properties[action.targetId][theirs.group], theirs.group)) {
    throw new GameError('No puedes coger propiedades de un set completo.');
  }
  takeFromHand(state, playerId, card.id);
  state.discard.push(card);
  state.cardsPlayedThisTurn += 1;
  const effect = { type: 'forced', a: playerId, aCard: action.myCardId, b: action.targetId, bCard: action.theirCardId };
  return openResponse(state, effect, playerId, action.targetId, events,
    `${name(state, playerId)} propone un Trato Forzoso a ${name(state, action.targetId)}.`);
}

// --- Trato Directo (roba un set completo) ---
function playDealBreaker(state, action, playerId, card, events) {
  requireTarget(state, playerId, action.targetId);
  const group = action.group;
  const pile = state.properties[action.targetId]?.[group];
  if (!isGroupComplete(pile, group)) throw new GameError('Solo puedes robar un set completo.');
  takeFromHand(state, playerId, card.id);
  state.discard.push(card);
  state.cardsPlayedThisTurn += 1;
  const effect = { type: 'dealbreaker', from: action.targetId, to: playerId, group };
  return openResponse(state, effect, playerId, action.targetId, events,
    `${name(state, playerId)} intenta llevarse el set ${group} de ${name(state, action.targetId)} (Trato Directo).`);
}

// --- Ventana de respuesta (¡Ni Hablar! y contras) ---
function openResponse(state, effect, originator, target, events, logText) {
  log(state, events, logText);
  state.pending = { kind: 'response', effect, originator, target, awaiting: target, cancelled: false };
  events.push({ type: 'response', effect: effect.type, originator, target });
  return settleResponse(state, events); // si el objetivo no puede responder, se resuelve ya
}

function settleResponse(state, events) {
  if (handHasJSN(state, state.pending.awaiting)) return { state, events };
  return closeResponse(state, events);
}

function closeResponse(state, events) {
  const p = state.pending;
  state.pending = null;
  if (!p.cancelled) applyEffect(state, p.effect, events);
  else log(state, events, 'La acción quedó anulada con ¡Ni Hablar!');
  return { state, events };
}

function handleResponse(state, action, playerId, events) {
  const p = state.pending;
  if (playerId !== p.awaiting) throw new GameError('No te toca responder.');
  if (action.type === 'allow') return closeResponse(state, events);
  if (action.type === 'sayNo') {
    const jsn = state.hands[playerId].find((c) => c.action === ACTION.JUST_SAY_NO);
    if (!jsn) throw new GameError('No tienes ¡Ni Hablar!');
    takeFromHand(state, playerId, jsn.id);
    state.discard.push(jsn);
    p.cancelled = !p.cancelled;
    p.awaiting = playerId === p.target ? p.originator : p.target;
    log(state, events, `${name(state, playerId)} juega ¡Ni Hablar!`);
    return settleResponse(state, events);
  }
  throw new GameError('Respuesta no válida.');
}

/** Ejecuta un efecto ya aceptado (no anulado). */
function applyEffect(state, effect, events) {
  switch (effect.type) {
    case 'sly': {
      const loc = findAsset(state, effect.from, effect.cardId);
      if (!loc || loc.where !== 'prop') return;
      removeAsset(state, effect.from, loc);
      giveToCollector(state, effect.to, loc.card, events);
      log(state, events, `${name(state, effect.to)} roba ${loc.card.name}.`);
      checkWin(state, effect.to, events);
      return;
    }
    case 'forced': {
      const la = findAsset(state, effect.a, effect.aCard);
      const lb = findAsset(state, effect.b, effect.bCard);
      if (!la || !lb) return;
      removeAsset(state, effect.a, la);
      removeAsset(state, effect.b, lb);
      giveToCollector(state, effect.b, la.card, events);
      giveToCollector(state, effect.a, lb.card, events);
      log(state, events, `${name(state, effect.a)} y ${name(state, effect.b)} intercambian propiedades.`);
      checkWin(state, effect.a, events);
      checkWin(state, effect.b, events);
      return;
    }
    case 'dealbreaker': {
      const pile = state.properties[effect.from]?.[effect.group];
      if (!pile) return;
      delete state.properties[effect.from][effect.group];
      const dest = ensurePile(state, effect.to, effect.group);
      for (const c of pile.cards) dest.cards.push({ ...c, assignedGroup: effect.group });
      dest.house = dest.house || pile.house;
      dest.hotel = dest.hotel || pile.hotel;
      log(state, events, `${name(state, effect.to)} se lleva el set ${effect.group}.`);
      checkWin(state, effect.to, events);
      return;
    }
    default:
      return;
  }
}

/** Juega una carta de Alquiler. Color-pair: cobra a todos; comodín: a un jugador. */
function playRent(state, action, playerId, card, events) {
  const group = action.group;
  if (!group) throw new GameError('Elige el color del alquiler.');
  if (card.groups !== 'any' && !card.groups.includes(group)) {
    throw new GameError('Esa carta de alquiler no cobra ese color.');
  }
  const pile = state.properties[playerId]?.[group];
  let amount = rentFor(pile, group);
  if (amount <= 0) throw new GameError('No tienes propiedades de ese color.');

  // Doble Alquiler (opcional): dobla el importe y gasta una jugada extra.
  let doubleCard = null;
  if (action.doubleRentCardId) {
    doubleCard = state.hands[playerId].find((c) => c.id === action.doubleRentCardId);
    if (!doubleCard || doubleCard.action !== ACTION.DOUBLE_RENT) {
      throw new GameError('No tienes esa carta de Doble Alquiler.');
    }
    if (state.cardsPlayedThisTurn + 2 > MAX_PLAYS) {
      throw new GameError('No te quedan jugadas suficientes para doblar el alquiler.');
    }
    amount *= 2;
  }

  let debtors;
  if (card.groups === 'any') {
    const t = action.targetId;
    if (!t || t === playerId || !state.players[t]) throw new GameError('Elige a quién cobrar.');
    debtors = [t];
  } else {
    debtors = state.playerOrder.filter((id) => id !== playerId);
  }
  takeFromHand(state, playerId, card.id);
  state.discard.push(card);
  state.cardsPlayedThisTurn += 1;
  if (doubleCard) {
    takeFromHand(state, playerId, doubleCard.id);
    state.discard.push(doubleCard);
    state.cardsPlayedThisTurn += 1;
  }
  log(state, events, `${name(state, playerId)} cobra ${amount} M de alquiler (${group}${doubleCard ? ', ¡doble!' : ''}).`);
  return startCharge(state, playerId, debtors, amount, 'rent', events);
}

/**
 * Abre una ventana de pago: cada deudor con patrimonio debe `amount` M al
 * cobrador. Los que no tienen nada se saltan (dan todo, que es nada).
 */
function startCharge(state, collectorId, debtorIds, amount, reason, events) {
  const debts = {};
  for (const id of debtorIds) {
    if (worthOf(state, id) > 0) debts[id] = amount;
  }
  if (Object.keys(debts).length === 0) return { state, events };
  state.pending = { kind: 'payment', collectorId, reason, amount, debts };
  events.push({ type: 'payment', collectorId, reason, amount, debtors: Object.keys(debts) });
  return { state, events };
}

function handlePending(state, action, playerId, events) {
  if (state.pending.kind === 'payment') return handlePay(state, action, playerId, events);
  if (state.pending.kind === 'response') return handleResponse(state, action, playerId, events);
  throw new GameError('Respuesta pendiente no reconocida.');
}

/** Localiza una carta de un jugador en su banco o propiedades. */
function findAsset(state, playerId, cardId) {
  const bankIdx = (state.banks[playerId] || []).findIndex((c) => c.id === cardId);
  if (bankIdx !== -1) return { where: 'bank', card: state.banks[playerId][bankIdx] };
  for (const [group, pile] of Object.entries(state.properties[playerId] || {})) {
    const idx = pile.cards.findIndex((c) => c.id === cardId);
    if (idx !== -1) return { where: 'prop', group, card: pile.cards[idx] };
  }
  return null;
}

function removeAsset(state, playerId, loc) {
  if (loc.where === 'bank') {
    state.banks[playerId] = state.banks[playerId].filter((c) => c.id !== loc.card.id);
    return;
  }
  const props = state.properties[playerId];
  const pile = props[loc.group];
  pile.cards = pile.cards.filter((c) => c.id !== loc.card.id);
  if (pile.cards.length === 0) delete props[loc.group];
  else if (!isGroupComplete(pile, loc.group)) {
    pile.house = false;
    pile.hotel = false;
  }
}

/** Entrega una carta al cobrador: dinero/acción al banco; propiedad a su color. */
function giveToCollector(state, collectorId, card, events) {
  if (card.type === CARD_TYPE.PROPERTY || card.type === CARD_TYPE.WILD) {
    const allowed = allowedGroups(card);
    const group = allowed.includes(card.assignedGroup) ? card.assignedGroup : allowed[0];
    const pile = ensurePile(state, collectorId, group);
    pile.cards.push({ ...card, assignedGroup: group });
  } else {
    const clean = { ...card };
    delete clean.assignedGroup;
    state.banks[collectorId].push(clean);
  }
}

function handlePay(state, action, playerId, events) {
  const p = state.pending;
  if (!(playerId in p.debts)) throw new GameError('No te toca pagar ahora.');
  const owed = p.debts[playerId];
  const ids = action.cardIds || [];

  const picked = [];
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const loc = findAsset(state, playerId, id);
    if (!loc) throw new GameError('No tienes esa carta para pagar.');
    picked.push(loc);
  }
  const selValue = picked.reduce((s, l) => s + (l.card.value || 0), 0);
  const worth = worthOf(state, playerId);
  // Debe cubrir lo adeudado, salvo que esté entregando todo lo que tiene.
  if (selValue < owed && selValue < worth) {
    throw new GameError(`Debes pagar ${owed} M (o entregar todo lo que tengas).`);
  }

  const moved = picked.map((l) => l.card);
  for (const loc of picked) removeAsset(state, playerId, loc);
  for (const c of moved) giveToCollector(state, p.collectorId, c, events);
  log(state, events, `${name(state, playerId)} paga ${selValue} M a ${name(state, p.collectorId)}.`);

  delete p.debts[playerId];
  if (Object.keys(p.debts).length === 0) {
    state.pending = null;
    // Recibir propiedades pudo completar sets del cobrador.
    checkWin(state, p.collectorId, events);
  }
  return { state, events };
}

// ---------------------------------------------------------------------------
// Terminar el turno (descartando hasta 7 si hace falta)
// ---------------------------------------------------------------------------

function handleEndTurn(state, action, playerId, events) {
  requireTurn(state, playerId);
  const discardIds = action.discardIds || [];
  const hand = state.hands[playerId];

  const excess = hand.length - HAND_LIMIT;
  if (excess > 0 && discardIds.length !== excess) {
    throw new GameError(`Tienes ${hand.length} cartas: descarta ${excess} para terminar (máximo ${HAND_LIMIT}).`);
  }
  if (excess <= 0 && discardIds.length > 0) {
    throw new GameError('No necesitas descartar.');
  }
  for (const id of discardIds) {
    const c = takeFromHand(state, playerId, id);
    state.discard.push(c);
  }
  if (discardIds.length) {
    log(state, events, `${name(state, playerId)} descarta ${discardIds.length} carta(s).`);
  }

  advanceTurn(state);
  log(state, events, `Turno de ${name(state, state.currentPlayer)}.`);
  events.push({ type: 'turn', playerId: state.currentPlayer });
  return { state, events };
}

// ---------------------------------------------------------------------------
// Serialización (vista por jugador; oculta las manos ajenas)
// ---------------------------------------------------------------------------

/** Vista pública de una ventana pendiente (pago, ¡Ni Hablar!…). */
function serializePending(pending) {
  if (!pending) return null;
  if (pending.kind === 'payment') {
    return {
      kind: 'payment',
      collectorId: pending.collectorId,
      reason: pending.reason,
      amount: pending.amount,
      debtors: Object.keys(pending.debts), // quiénes siguen debiendo
    };
  }
  if (pending.kind === 'response') {
    return {
      kind: 'response',
      effect: pending.effect.type, // 'sly' | 'forced' | 'dealbreaker'
      originator: pending.originator,
      target: pending.target,
      awaiting: pending.awaiting, // a quién le toca responder (¡Ni Hablar! o aceptar)
    };
  }
  return { kind: pending.kind };
}

/** Vista pública de las propiedades de un jugador. */
function publicProperties(props) {
  const out = {};
  for (const [group, pile] of Object.entries(props)) {
    out[group] = {
      cards: pile.cards.map((c) => ({ id: c.id, type: c.type, name: c.name })),
      house: !!pile.house,
      hotel: !!pile.hotel,
      complete: isGroupComplete(pile, group),
    };
  }
  return out;
}

/** Vista del estado para un jugador concreto. */
export function serializeState(state, viewerId) {
  if (!state) return null;
  return {
    status: state.status,
    winner: state.winner,
    currentPlayer: state.currentPlayer,
    cardsPlayedThisTurn: state.cardsPlayedThisTurn,
    maxPlays: MAX_PLAYS,
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    pending: serializePending(state.pending),
    you: viewerId
      ? { id: viewerId, hand: state.hands[viewerId] || [] }
      : null,
    players: state.playerOrder.map((id) => ({
      id,
      nickname: state.players[id].nickname,
      handCount: (state.hands[id] || []).length,
      bank: (state.banks[id] || []).map((c) => ({ id: c.id, type: c.type, name: c.name, value: c.value })),
      bankValue: bankValue(state, id),
      properties: publicProperties(state.properties[id] || {}),
      setsComplete: countCompleteSets(state, id),
    })),
    log: state.log.slice(-30),
  };
}

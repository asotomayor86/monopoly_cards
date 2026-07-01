// Constantes compartidas entre cliente y servidor.
// Mantener este archivo libre de dependencias para poder importarlo en ambos lados.

/** Estado de una sala. */
export const ROOM_STATUS = {
  WAITING: 'waiting',   // sala de espera, aún no ha empezado la partida
  PLAYING: 'playing',   // partida en curso
  FINISHED: 'finished', // partida terminada
};

/** Límites de jugadores por sala (Monopoly Deal oficial: 2-5). */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

/** Roles de sesión. */
export const ROLE = {
  PLAYER: 'player',
  ADMIN: 'admin',
};

/** Eventos de transporte (un único catálogo para evitar strings sueltos). En
 *  producción cada evento se traduce a una llamada REST (ver client/socket.js);
 *  en dev los sirve Socket.IO. */
export const EVENTS = {
  // Cliente -> Servidor
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_RECONNECT: 'room:reconnect',
  ROOM_LEAVE: 'room:leave',
  ROOM_START: 'room:start',
  ROOM_RESTART: 'room:restart',
  ROOM_NEXT: 'room:next',
  GAME_ACTION: 'game:action',
  ADMIN_LIST: 'admin:list',
  ADMIN_CLOSE: 'admin:close',

  // Servidor -> Cliente
  ROOM_UPDATE: 'room:update',
  ROOM_CLOSED: 'room:closed',
  ADMIN_ROOMS: 'admin:rooms',
  GAME_STATE: 'game:state',
  GAME_LOG: 'game:log',
  ERROR: 'app:error',
};

// ---------------------------------------------------------------------------
// Catálogo de cartas de Monopoly Deal (versión española con calles de Madrid).
// El motor de reglas (Fase 2) construye la baraja de 110 cartas a partir de esto.
// ---------------------------------------------------------------------------

/** Tipos de carta de Monopoly Deal. */
export const CARD_TYPE = {
  PROPERTY: 'property', // propiedad de un grupo de color
  WILD: 'wild',         // comodín de propiedad (bicolor o multicolor)
  MONEY: 'money',       // carta de dinero (banco)
  RENT: 'rent',         // cobra alquiler de un par de colores
  ACTION: 'action',     // carta de acción (ver ACTION)
};

/** Cartas de acción de Monopoly Deal. */
export const ACTION = {
  DEAL_BREAKER: 'deal_breaker',     // Trato Directo: roba un set completo
  SLY_DEAL: 'sly_deal',             // Robo: roba una propiedad suelta
  FORCED_DEAL: 'forced_deal',       // Trato Forzoso: intercambia propiedades
  JUST_SAY_NO: 'just_say_no',       // ¡Ni Hablar!: anula una acción en tu contra
  DEBT_COLLECTOR: 'debt_collector', // Cobrador: cobra 5 M a un jugador
  ITS_MY_BIRTHDAY: 'birthday',      // ¡Es mi cumpleaños!: cada jugador te da 2 M
  PASS_GO: 'pass_go',               // Pasa por la Salida: roba 2 cartas
  HOUSE: 'house',                   // Casa: +3 M de alquiler en un set completo
  HOTEL: 'hotel',                   // Hotel: +4 M de alquiler en un set con casa
  DOUBLE_RENT: 'double_rent',       // Doble Alquiler: dobla un alquiler
};

/**
 * Grupos de propiedades, en orden de tablero. Cada grupo define:
 *  - label: nombre del color en español + `hex` para la UI
 *  - value: valor de la carta si se juega como dinero (millones)
 *  - rent: alquiler según cuántas propiedades del set tengas (índice = nº-1)
 *  - setSize: propiedades necesarias para completar el set
 *  - streets: nombres (calles del Monopoly Madrid clásico)
 * Nota: los precios en pesetas del tablero NO aplican a Monopoly Deal.
 */
export const PROPERTY_GROUPS = {
  brown: {
    label: 'Marrón', hex: '#8b5a2b', value: 1, rent: [1, 2], setSize: 2,
    streets: ['Ronda de Valencia', 'Plaza de Lavapiés'],
  },
  lightblue: {
    label: 'Azul celeste', hex: '#8fd0e8', value: 1, rent: [1, 2, 3], setSize: 3,
    streets: ['Avenida de Reina Victoria', 'Glorieta de Cuatro Caminos', 'Calle de Bravo Murillo'],
  },
  pink: {
    label: 'Rosa', hex: '#d94b8f', value: 2, rent: [1, 2, 4], setSize: 3,
    streets: ['Calle de Alberto Aguilera', 'Glorieta de Bilbao', 'Calle de Fuencarral'],
  },
  orange: {
    label: 'Naranja', hex: '#e8892b', value: 2, rent: [1, 3, 5], setSize: 3,
    streets: ['Avenida de Felipe II', 'Calle de Velázquez', 'Calle de Serrano'],
  },
  red: {
    label: 'Rojo', hex: '#d23b3b', value: 3, rent: [2, 3, 6], setSize: 3,
    streets: ['Avenida de América', 'Calle de María de Molina', 'Calle de Cea Bermúdez'],
  },
  yellow: {
    label: 'Amarillo', hex: '#f2c62e', value: 3, rent: [2, 4, 6], setSize: 3,
    streets: ['Avenida de los Reyes Católicos', 'Calle de Bailén', 'Plaza de España'],
  },
  green: {
    label: 'Verde', hex: '#2e9e5b', value: 4, rent: [2, 4, 7], setSize: 3,
    streets: ['Calle de Alcalá', 'Puerta del Sol', 'Gran Vía'],
  },
  darkblue: {
    label: 'Azul oscuro', hex: '#1f3f9e', value: 4, rent: [3, 8], setSize: 2,
    streets: ['Paseo de la Castellana', 'Paseo del Prado'],
  },
  railroad: {
    label: 'Estaciones', hex: '#3a3a3a', value: 2, rent: [1, 2, 3, 4], setSize: 4,
    streets: [
      'Estación de Mediodía (Atocha)',
      'Estación de las Delicias',
      'Estación del Norte (Príncipe Pío)',
      'Estación de Goya',
    ],
  },
  utility: {
    label: 'Compañías', hex: '#9aa07a', value: 2, rent: [1, 2], setSize: 2,
    streets: ['Compañía de Aguas', 'Compañía de Electricidad'],
  },
};

/** Nº de sets completos necesarios para ganar (regla oficial). */
export const SETS_TO_WIN = 3;

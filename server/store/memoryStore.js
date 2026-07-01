// Implementación del store en memoria.
// Cumple la interfaz descrita en store/index.js. Para migrar a Redis/SQLite
// basta con crear otro módulo con los mismos métodos y cambiar el import en index.js.

const rooms = new Map(); // code -> room

export const memoryStore = {
  /** Guarda (crea o reemplaza) una sala. */
  set(room) {
    rooms.set(room.code, room);
    return room;
  },

  /** Devuelve una sala por su código, o null. */
  get(code) {
    return rooms.get(code) || null;
  },

  /** ¿Existe una sala con ese código? */
  has(code) {
    return rooms.has(code);
  },

  /** Lista todas las salas. */
  list() {
    return Array.from(rooms.values());
  },

  /** Elimina una sala. */
  delete(code) {
    return rooms.delete(code);
  },
};

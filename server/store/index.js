// Punto único de acceso al store. Cambiar aquí la implementación (memoria/Redis/SQLite)
// sin tocar la lógica de salas ni de juego.
//
// Interfaz esperada:
//   set(room) -> room
//   get(code) -> room | null
//   has(code) -> boolean
//   list() -> room[]
//   delete(code) -> boolean

import { memoryStore } from './memoryStore.js';

export const store = memoryStore;

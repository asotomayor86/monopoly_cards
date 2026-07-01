import { GameError } from '../../server/game/gameEngine.js';
import { RoomError } from './rooms.js';

// Envuelve un handler: captura errores de dominio (RoomError/GameError) y los
// devuelve como 400 con mensaje legible; el resto como 500 genérico.
export function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const known = err instanceof RoomError || err instanceof GameError;
      if (!known) console.error('[api]', err);
      res.status(known ? 400 : 500).json({
        error: known ? err.message : 'Ha ocurrido un error inesperado.',
      });
    }
  };
}

/** Rechaza métodos no permitidos. `methods` es un array, p.ej. ['POST']. */
export function methodGuard(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.status(405).json({ error: 'Método no permitido.' });
    return false;
  }
  return true;
}

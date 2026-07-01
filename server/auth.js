import { nanoid } from 'nanoid';
import { config } from './config.js';
import { ROLE } from '../shared/constants.js';

// Sesión simple en memoria: token -> { role }.
// Suficiente para uso familiar; si se quisiera persistencia/escala se cambiaría por JWT o Redis.
const sessions = new Map();

/**
 * Valida el código de acceso a la web y emite un token de jugador.
 * @returns {string|null} token, o null si el código es incorrecto.
 */
export function loginSite(code) {
  if (code !== config.siteAccessCode) return null;
  const token = nanoid(24);
  sessions.set(token, { role: ROLE.PLAYER });
  return token;
}

/**
 * Valida el código de administrador y emite un token de admin.
 * @returns {string|null}
 */
export function loginAdmin(code) {
  if (code !== config.adminCode) return null;
  const token = nanoid(24);
  sessions.set(token, { role: ROLE.ADMIN });
  return token;
}

/** Devuelve la sesión asociada a un token, o null. */
export function getSession(token) {
  if (!token) return null;
  return sessions.get(token) || null;
}

/** Comprueba que el token corresponde a una sesión válida (cualquier rol). */
export function isValid(token) {
  return sessions.has(token);
}

/** Comprueba que el token es de administrador. */
export function isAdmin(token) {
  const s = getSession(token);
  return s?.role === ROLE.ADMIN;
}

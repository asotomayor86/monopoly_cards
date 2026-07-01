import crypto from 'node:crypto';

// Autenticación sin estado para serverless: la cookie guarda un token = SHA-256 del
// código de acceso. Para verificar, se recalcula y se compara en tiempo constante.
// No hay tabla de sesiones (cada función es efímera); el "estado" es el propio hash.

export const COOKIE_SITE = 'mc_site';
export const COOKIE_ADMIN = 'mc_admin';
export const COOKIE_USER = 'mc_user'; // identidad del hub (userId+nombre), firmada
const MAX_AGE = 60 * 60 * 24 * 30; // 30 días

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// --- Identidad del jugador (SSO con el hub) ---------------------------------
// Tras iniciar sesión con Neon Auth en el cliente (email+contraseña, que verifica
// la contraseña contra la cuenta real), el cliente nos pasa su userId+nombre y
// firmamos una cookie con HMAC para que no se manipule entre peticiones. La
// pertenencia a la SALA se valida aparte contra el hub, y el resultado lo escribe
// el hub revalidando. (Neon Auth beta no expone JWKS ni valida sesión por bearer,
// así que el servidor del juego no puede re-verificar el JWT por su cuenta.)

function signingSecret() {
  return (
    process.env.AUTH_SIGNING_SECRET ||
    process.env.HUB_RESULT_SECRET ||
    process.env.ADMIN_CODE ||
    'dev-insecure-secret'
  );
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function hmac(value) {
  return crypto.createHmac('sha256', signingSecret()).update(value).digest('base64url');
}

/** Construye el valor firmado de la cookie de usuario: payload.firma */
export function signUser(user) {
  const payload = b64url(JSON.stringify({ id: user.id, name: user.name || '' }));
  return `${payload}.${hmac(payload)}`;
}

/** Lee y verifica la identidad del usuario desde la cookie; null si no es válida. */
export function readUser(req) {
  const c = parseCookies(req);
  const raw = c[COOKIE_USER];
  if (!raw || !raw.includes('.')) return null;
  const [payload, sig] = raw.split('.');
  if (!safeEqual(sig, hmac(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.id) return null;
    return { id: data.id, name: data.name || '' };
  } catch {
    return null;
  }
}

export function setUserCookie(res, user) {
  const cookie = [
    `${COOKIE_USER}=${encodeURIComponent(signUser(user))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
    `Max-Age=${MAX_AGE}`,
  ].join('; ');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, cookie) : cookie);
}

export function clearUserCookie(res) {
  const cookie = `${COOKIE_USER}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, cookie) : cookie);
}

/** Token esperado para el acceso de jugador (derivado del código de la web). */
export function siteToken() {
  return sha256('site:' + (process.env.SITE_ACCESS_CODE || ''));
}

/** Token esperado para el acceso de administrador. */
export function adminToken() {
  return sha256('admin:' + (process.env.ADMIN_CODE || ''));
}

/** Comparación en tiempo constante de dos hex del mismo tamaño. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Añade una cookie httpOnly al response (acumulando con otras Set-Cookie). */
export function setAuthCookie(res, name, value) {
  const cookie = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
    `Max-Age=${MAX_AGE}`,
  ].join('; ');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, cookie) : cookie);
}

/** Caduca una cookie (Max-Age=0) para cerrar sesión. */
export function clearAuthCookie(res, name) {
  const cookie = `${name}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, cookie) : cookie);
}

/**
 * Estado de autenticación de la petición. Admin implica acceso de jugador.
 * Un usuario identificado (SSO del hub) también cuenta como acceso de jugador.
 */
export function getAuth(req) {
  const c = parseCookies(req);
  const isAdmin = !!c[COOKIE_ADMIN] && safeEqual(c[COOKIE_ADMIN], adminToken());
  const user = readUser(req);
  const legacySite = !!c[COOKIE_SITE] && safeEqual(c[COOKIE_SITE], siteToken());
  const isSite = isAdmin || !!user || legacySite;
  return { isSite, isAdmin, user };
}

/** Exige acceso de jugador; si falta, responde 401 y devuelve null. */
export function requireSite(req, res) {
  const auth = getAuth(req);
  if (!auth.isSite) {
    res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
    return null;
  }
  return auth;
}

/** Exige un usuario identificado (SSO del hub); si falta, responde 401. */
export function requireUser(req, res) {
  const user = readUser(req);
  if (!user) {
    res.status(401).json({ error: 'No autorizado. Inicia sesión con tu cuenta.' });
    return null;
  }
  return user;
}

/** Exige acceso de administrador; si falta, responde 403 y devuelve null. */
export function requireAdmin(req, res) {
  const auth = getAuth(req);
  if (!auth.isAdmin) {
    res.status(403).json({ error: 'Acceso de administrador requerido.' });
    return null;
  }
  return auth;
}

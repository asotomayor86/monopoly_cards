import { createAuthClient } from '@neondatabase/auth';

// Cliente de Neon Auth del juego: apunta al PROXY de auth del HUB, así se usan las
// MISMAS cuentas (email+contraseña) que en el hub. El login verifica la contraseña
// real contra Neon Auth; con el userId resultante, el juego fija su propia sesión
// (cookie mc_user en su dominio) llamando a /api/access.
//
// Configura VITE_NEON_AUTH_URL en el juego (build) = https://<hub>/api/auth.
// Si el juego se sirve bajo gamehub.family, el fallback apunta al hub en la
// raíz para que la cookie de Neon Auth (Domain=.gamehub.family) se comparta.
// Si se sirve desde la URL de Vercel, mantenemos el fallback antiguo.
const fallbackHubUrl =
  typeof location !== 'undefined' && location.hostname.endsWith('gamehub.family')
    ? 'https://gamehub.family'
    : 'https://one-page-to-rule-them-all.vercel.app';

// IMPORTANTE: la integración Neon-Vercel de la BD del juego inyecta
// VITE_NEON_AUTH_URL apuntando al Neon Auth PROPIO de esa BD (cuentas vacías,
// otro proyecto), lo que provoca "Invalid origin" al loguear. El SSO debe ir
// SIEMPRE contra el hub (cuentas compartidas), así que ignoramos cualquier valor
// que apunte a neon.tech y derivamos la URL del hub.
const hubProxy = (url) => url && !url.includes('neon.tech');
const NEON_AUTH_URL = hubProxy(import.meta.env.VITE_NEON_AUTH_URL)
  ? import.meta.env.VITE_NEON_AUTH_URL
  : `${fallbackHubUrl}/api/auth`;

// URL base del hub (sin el sufijo /api/auth). Se usa para devolver al jugador al
// hub al terminar un partido de liga.
export const HUB_URL = hubProxy(import.meta.env.VITE_HUB_URL)
  ? import.meta.env.VITE_HUB_URL.replace(/\/+$/, '')
  : NEON_AUTH_URL.replace(/\/api\/auth\/?$/, '');

export const authClient = createAuthClient(NEON_AUTH_URL);

/** Inicia sesión con email+contraseña del hub. Devuelve { id, name } o lanza error. */
export async function loginConHub(email, password) {
  const res = await authClient.signIn.email({ email, password });
  const error = res?.error;
  if (error) {
    throw new Error(error.message || 'Email o contraseña incorrectos.');
  }
  // La forma del resultado puede ser { data: { user } } o { user }.
  const user = res?.data?.user ?? res?.user;
  if (!user?.id) throw new Error('No se pudo iniciar sesión.');
  return { id: user.id, name: user.name || user.email || '' };
}

/** Cierra la sesión de Neon Auth (mejor esfuerzo). */
export async function logoutNeon() {
  try {
    await authClient.signOut();
  } catch {
    /* la cookie del juego se limpia aparte en /api/access */
  }
}

/**
 * Si ya hay una sesión iniciada en el hub (cookie de Neon Auth presente en
 * este navegador para el dominio del hub), devuelve {id, name}. Si no, null.
 * Se usa para evitar pedir email+contraseña otra vez al entrar en el juego
 * desde una invitación del hub.
 */
export async function trySessionFromHub() {
  try {
    const res = await authClient.getSession();
    const user = res?.data?.user ?? res?.data?.session?.user ?? res?.user;
    if (!user?.id) return null;
    return { id: user.id, name: user.name || user.email || '' };
  } catch {
    return null;
  }
}

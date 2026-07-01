// Cliente del Hub familiar de juegos.
//
// El juego consulta la sala (lobby) creada en el hub y le devuelve el resultado.
// - Leer la sala: GET {HUB_URL}/api/rooms/{code}  (el código actúa de llave).
// - Devolver resultado: POST {HUB_URL}/api/rooms/{code}/result con HUB_RESULT_SECRET
//   (servidor a servidor; el hub valida que los jugadores son de la sala, escribe
//   la partida en estadísticas y cierra la sala).
//
// Variables de entorno (en el juego):
//   HUB_URL            -> p.ej. https://one-page-to-rule-them-all.vercel.app
//   HUB_RESULT_SECRET  -> secreto compartido con el hub (solo backend)

function hubUrl() {
  const base = process.env.HUB_URL;
  if (!base) throw new Error('Falta la variable de entorno HUB_URL');
  return base.replace(/\/+$/, '');
}

/**
 * Devuelve la sala del hub para un código, o null si no existe / está cerrada.
 * Forma: { code, status, game: { slug, name, url }, players: [{ userId, name, role }] }
 */
export async function getHubRoom(code) {
  const res = await fetch(`${hubUrl()}/api/rooms/${encodeURIComponent(code)}`, {
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Hub respondió ${res.status} al leer la sala`);
  return res.json();
}

/** ¿Está este userId entre los jugadores (role 'player') de la sala? */
export function esJugadorDeSala(sala, userId) {
  if (!sala || !Array.isArray(sala.players)) return false;
  return sala.players.some((p) => p.userId === userId && p.role === 'player');
}

/**
 * Envía el resultado de la partida al hub y cierra la sala.
 * @param {string} code
 * @param {{ kind?: 'ranked'|'practice', notes?: string,
 *           results: Array<{ userId: string, result: 'win'|'loss'|'draw',
 *                            score?: number, position?: number }> }} payload
 * @returns {Promise<{ ok: boolean, matchId?: string, error?: string, status: number }>}
 */
export async function submitHubResult(code, payload) {
  const secret = process.env.HUB_RESULT_SECRET;
  if (!secret) throw new Error('Falta la variable de entorno HUB_RESULT_SECRET');

  const res = await fetch(
    `${hubUrl()}/api/rooms/${encodeURIComponent(code)}/result`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ kind: 'ranked', ...payload }),
    },
  );

  let body = {};
  try {
    body = await res.json();
  } catch {
    /* sin cuerpo */
  }
  return { ok: res.ok, status: res.status, ...body };
}

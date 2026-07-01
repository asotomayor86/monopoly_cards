import {
  setUserCookie,
  clearUserCookie,
  clearAuthCookie,
  COOKIE_SITE,
} from './_lib/auth.js';

// POST /api/access { userId, name } → fija la cookie de identidad tras el login de
//   Neon Auth en el cliente (el login ya ha verificado la contraseña real de la
//   cuenta del hub; aquí solo persistimos quién es).
// DELETE /api/access → cierra sesión (caduca las cookies).
//
// Nota: se reutiliza este endpoint (en lugar de crear /api/session) por el límite
// de 12 funciones serverless del plan Hobby de Vercel.
export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    clearUserCookie(res);
    clearAuthCookie(res, COOKIE_SITE); // limpia también el acceso antiguo si existiera
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  const userId = (req.body?.userId ?? '').toString();
  const name = (req.body?.name ?? '').toString().slice(0, 60);
  if (!userId) {
    return res.status(400).json({ error: 'Falta la identidad del usuario.' });
  }
  setUserCookie(res, { id: userId, name });
  res.status(200).json({ ok: true, user: { id: userId, name } });
}

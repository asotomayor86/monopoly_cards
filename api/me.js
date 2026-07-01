import { getAuth } from './_lib/auth.js';

// GET /api/me → estado de autenticación actual (las cookies son httpOnly, el cliente
// no puede leerlas; usa este endpoint al cargar para saber si ya hay sesión y quién es).
export default async function handler(req, res) {
  const { isSite, isAdmin, user } = getAuth(req);
  res.status(200).json({ isSite, isAdmin, user });
}

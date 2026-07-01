import { adminToken, setAuthCookie, COOKIE_ADMIN } from '../_lib/auth.js';

// POST /api/admin/access { code } → valida el código de administrador y deja su cookie.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  const code = (req.body?.code ?? '').toString();
  if (code !== (process.env.ADMIN_CODE || '')) {
    return res.status(401).json({ error: 'Código de administrador incorrecto.' });
  }
  setAuthCookie(res, COOKIE_ADMIN, adminToken());
  res.status(200).json({ ok: true });
}

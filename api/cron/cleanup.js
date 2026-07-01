import { getSql } from '../_lib/db.js';

// Limpieza de salas inactivas. La invoca el Cron de Vercel (ver vercel.json).
// Borra las salas cuyo último cambio fue hace más de IDLE_HOURS.
const IDLE_HOURS = 2;

export default async function handler(req, res) {
  // Si hay CRON_SECRET configurado, exige el header que Vercel añade automáticamente.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'No autorizado.' });
  }
  try {
    const rows = await getSql()`
      DELETE FROM rooms
      WHERE updated_at < now() - (${IDLE_HOURS} * interval '1 hour')
      RETURNING code`;
    res.status(200).json({ ok: true, removed: rows.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

import { getSql } from './_lib/db.js';

// GET /api/health → comprueba que la función responde y que Neon es alcanzable.
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const rows = await sql`SELECT 1 AS ok`;
    res.status(200).json({ ok: true, db: rows[0]?.ok === 1 });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

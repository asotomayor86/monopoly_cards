import { neon } from '@neondatabase/serverless';

// Cliente Neon perezoso (singleton). Se crea en la PRIMERA consulta, no al importar,
// para que el build no falle si DATABASE_URL todavía no está inyectada.
//
// fetchOptions.cache='no-store' evita que la capa de fetch cachee lecturas y
// devuelva estado obsoleto (gotcha conocido con drivers serverless sobre fetch).
let _sql = null;

export function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no está configurada.');
  _sql = neon(url, { fetchOptions: { cache: 'no-store' } });
  return _sql;
}

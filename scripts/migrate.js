import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

// Vercel/Neon inyecta DATABASE_URL en .env.local; .env es para el resto.
dotenv.config({ path: '.env.local' });
dotenv.config();

// Crea (idempotente) el esquema en Neon. Ejecutar con: node scripts/migrate.js
// Requiere DATABASE_URL en el entorno (o en .env).
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL. Configúrala antes de migrar.');
  process.exit(1);
}

const sql = neon(url);

await sql`
  CREATE TABLE IF NOT EXISTS rooms (
    code        text PRIMARY KEY,
    state       jsonb       NOT NULL,
    version     int         NOT NULL DEFAULT 0,
    status      text        NOT NULL DEFAULT 'lobby',
    updated_at  timestamptz NOT NULL DEFAULT now()
  )
`;

// Índice para el barrido de salas inactivas (limpieza por updated_at).
await sql`CREATE INDEX IF NOT EXISTS rooms_updated_at_idx ON rooms (updated_at)`;

console.log('Migración completada: tabla "rooms" lista.');

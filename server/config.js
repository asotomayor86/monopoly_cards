import dotenv from 'dotenv';

dotenv.config();

/** Configuración leída de variables de entorno. */
export const config = {
  siteAccessCode: process.env.SITE_ACCESS_CODE || 'familia2024',
  adminCode: process.env.ADMIN_CODE || 'admin-secreto',
  port: Number(process.env.PORT) || 3000,
  // Tiempo de inactividad tras el cual una sala se limpia automáticamente (2 h).
  roomIdleMs: 2 * 60 * 60 * 1000,
  // Cada cuánto corre el barrido de limpieza.
  cleanupIntervalMs: 5 * 60 * 1000,
};

// Aviso si se usan los valores por defecto (no fallar: facilita el desarrollo).
if (!process.env.SITE_ACCESS_CODE || !process.env.ADMIN_CODE) {
  console.warn(
    '[config] Usando códigos por defecto. Crea un archivo .env (ver .env.example) antes de desplegar.'
  );
}

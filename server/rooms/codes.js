// Generador de códigos de sala legibles.
// Mayúsculas sin caracteres ambiguos (sin I, O, 0, 1) para evitar errores al dictarlos.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;

/** Genera un código aleatorio (no garantiza unicidad; eso lo asegura el roomManager). */
export function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

/**
 * Genera un código único respecto a una función `exists(code)`.
 * Tras varios intentos fallidos alarga el código (caso extremo, muchas salas).
 */
export function generateUniqueCode(exists) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = generateCode();
    if (!exists(code)) return code;
  }
  // Fallback improbable: añade un carácter extra.
  let code = generateCode() + ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  while (exists(code)) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return code;
}

/** Normaliza la entrada del usuario (mayúsculas, sin espacios). */
export function normalizeCode(input) {
  return String(input || '').trim().toUpperCase();
}

import { hash, verify } from '@node-rs/argon2';

// argon2id con los parámetros por defecto (recomendación de OWASP). El hash
// incluye algoritmo, parámetros y salt: no hace falta guardar nada más.
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

// Un hash malformado cuenta como contraseña incorrecta, no como error.
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await verify(hash, plain);
  } catch {
    return false;
  }
}

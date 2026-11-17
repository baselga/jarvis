// Código de Postgres para «viola una restricción unique».
const UNIQUE_VIOLATION = '23505';
// Código de Postgres para «viola una restricción check».
const CHECK_VIOLATION = '23514';
// Claves foráneas: `23001` lo lanza `ON DELETE RESTRICT` (borrar algo referenciado) y
// `23503`, `NO ACTION` o un id que no existe al insertar. Se tratan igual.
const FOREIGN_KEY_VIOLATIONS = ['23001', '23503'];

const codeOf = (value: unknown) =>
  typeof value === 'object' && value !== null && 'code' in value ? value.code : undefined;

const hasCode = (error: unknown, codes: string[]) =>
  [error, error instanceof Error ? error.cause : undefined].some((e) =>
    codes.includes(String(codeOf(e))),
  );

// Drizzle 0.45 envuelve el error de `postgres` en un `DrizzleQueryError`: el código
// está en `cause`. Se miran los dos por si cambia el envoltorio.
export function isUniqueViolation(error: unknown): boolean {
  return hasCode(error, [UNIQUE_VIOLATION]);
}

export function isForeignKeyViolation(error: unknown): boolean {
  return hasCode(error, FOREIGN_KEY_VIOLATIONS);
}

export function isCheckViolation(error: unknown): boolean {
  return hasCode(error, [CHECK_VIOLATION]);
}

// Nombre de la restricción que saltó (`constraint_name` del error de `postgres`), para saber
// cuál de varias claves foráneas de una misma sentencia falló.
export function constraintOf(error: unknown): string | undefined {
  for (const e of [error, error instanceof Error ? error.cause : undefined]) {
    if (typeof e === 'object' && e !== null && 'constraint_name' in e) {
      return String(e.constraint_name);
    }
  }
  return undefined;
}

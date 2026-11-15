// Código de Postgres para «viola una restricción unique».
const UNIQUE_VIOLATION = '23505';

const codeOf = (value: unknown) =>
  typeof value === 'object' && value !== null && 'code' in value ? value.code : undefined;

// Drizzle 0.45 envuelve el error de `postgres` en un `DrizzleQueryError`: el código
// está en `cause`. Se miran los dos por si cambia el envoltorio.
export function isUniqueViolation(error: unknown): boolean {
  return (
    codeOf(error) === UNIQUE_VIOLATION ||
    (error instanceof Error && codeOf(error.cause) === UNIQUE_VIOLATION)
  );
}

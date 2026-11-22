// Código de Postgres para «viola una restricción unique».
const UNIQUE_VIOLATION = '23505';
// Código de Postgres para «viola una restricción check».
const CHECK_VIOLATION = '23514';
// Claves foráneas: `23001` lo lanza `ON DELETE RESTRICT` (borrar algo referenciado) y
// `23503`, `NO ACTION` o un id que no existe al insertar. Se tratan igual.
const FOREIGN_KEY_VIOLATIONS = ['23001', '23503'];
// «La BD no está disponible»: errores de red de Node, del cliente `postgres` y SQLSTATE de
// Postgres al apagarse/arrancar (`57P0x`) o sin conexiones libres (`53300`). La clase `08`
// (connection exception) entera se mira aparte por prefijo.
const DB_UNAVAILABLE = [
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  '57P01',
  '57P02',
  '57P03',
  '53300',
];

const codeOf = (value: unknown) =>
  typeof value === 'object' && value !== null && 'code' in value ? value.code : undefined;

// El error y su `cause`: donde puede estar el código (ver abajo).
const withCause = (error: unknown) => [error, error instanceof Error ? error.cause : undefined];

const hasCode = (error: unknown, codes: string[]) =>
  withCause(error).some((e) => codes.includes(String(codeOf(e))));

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

// Fallo de conexión con la BD (503), no de la consulta: un bug de SQL sigue siendo un 500.
export function isDbUnavailable(error: unknown): boolean {
  return (
    hasCode(error, DB_UNAVAILABLE) || withCause(error).some((e) => /^08/.test(String(codeOf(e))))
  );
}

// Nombre de la restricción que saltó (`constraint_name` del error de `postgres`), para saber
// cuál de varias claves foráneas de una misma sentencia falló.
export function constraintOf(error: unknown): string | undefined {
  for (const e of withCause(error)) {
    if (typeof e === 'object' && e !== null && 'constraint_name' in e) {
      return String(e.constraint_name);
    }
  }
  return undefined;
}

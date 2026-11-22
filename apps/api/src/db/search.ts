import { type AnyColumn, type SQL, sql } from 'drizzle-orm';

// Patrón para `ILIKE` de «contiene `q`». `%` y `_` son comodines en el patrón y `\` es
// el escape por defecto de Postgres: se escapan los tres para que se busquen literales.
export function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, '\\$&')}%`;
}

// «col contiene q» sin distinguir mayúsculas ni tildes. `unaccent` (extensión, migración
// 0003) se aplica a los dos lados; no toca `%`, `_` ni `\`, así que el escape sigue valiendo.
export function containsText(col: AnyColumn | SQL, q: string): SQL {
  return sql`unaccent(${col}) ilike unaccent(${containsPattern(q)})`;
}

// Patrón para `ILIKE` de «contiene `q`». `%` y `_` son comodines en el patrón y `\` es
// el escape por defecto de Postgres: se escapan los tres para que se busquen literales.
export function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, '\\$&')}%`;
}

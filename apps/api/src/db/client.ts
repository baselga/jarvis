import type { PgDatabase } from 'drizzle-orm/pg-core';
import { type PostgresJsQueryResultHKT, drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

// `postgres` gestiona el pool de conexiones; Drizzle construye las consultas
// encima. Devolvemos los dos para poder cerrar el pool al parar la app.
export function createDb(url: string) {
  const client = postgres(url, { connect_timeout: 5 });
  // Con `schema`, Drizzle conoce las tablas: tipos y consultas relacionales.
  const db = drizzle({ client, schema });
  return { db, close: () => client.end({ timeout: 5 }) };
}

export type Db = ReturnType<typeof createDb>['db'];

// Lo que tienen en común `Db` y la `tx` de `db.transaction(async (tx) => …)`:
// las funciones que lo aceptan sirven dentro y fuera de una transacción.
export type DbOrTx = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// `postgres` gestiona el pool de conexiones; Drizzle construye las consultas
// encima. Devolvemos los dos para poder cerrar el pool al parar la app.
export function createDb(url: string) {
  const client = postgres(url, { connect_timeout: 5 });
  const db = drizzle({ client });
  return { db, close: () => client.end({ timeout: 5 }) };
}

export type Db = ReturnType<typeof createDb>['db'];

import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Ruta resuelta desde este archivo, no desde el cwd: funciona se lance desde donde se lance.
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

// Aplica las migraciones pendientes de `drizzle/` en la BD de `url`. Drizzle apunta
// las aplicadas en `__drizzle_migrations`, así que ejecutarlo de nuevo no hace nada.
// La usan `migrate.ts` (BD de desarrollo) y el globalSetup de los tests (BD de test).
export async function runMigrations(url: string): Promise<void> {
  // Una sola conexión: las migraciones van en serie. Sin los NOTICE de Postgres
  // ("schema drizzle already exists, skipping"), que solo ensucian el log.
  const client = postgres(url, { max: 1, connect_timeout: 5, onnotice: () => {} });
  try {
    await migrate(drizzle({ client }), { migrationsFolder });
  } finally {
    await client.end({ timeout: 5 });
  }
}

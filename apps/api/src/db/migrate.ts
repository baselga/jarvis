import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { loadConfig } from '../config.js';

// Aplica las migraciones pendientes de `drizzle/`. Drizzle apunta las aplicadas
// en `__drizzle_migrations`, así que ejecutarlo de nuevo no hace nada.
// Ruta resuelta desde este archivo, no desde el cwd: funciona se lance desde donde se lance.
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

const config = loadConfig();
// Una sola conexión: las migraciones van en serie. Sin los NOTICE de Postgres
// ("schema drizzle already exists, skipping"), que solo ensucian el log.
const client = postgres(config.DATABASE_URL, {
  max: 1,
  connect_timeout: 5,
  onnotice: () => {},
});

try {
  await migrate(drizzle({ client }), { migrationsFolder });
  console.log('Migraciones al día');
} catch (error) {
  console.error('Error al aplicar las migraciones:', error);
  // Código ≠ 0: el contenedor no arranca el servidor con la BD a medias.
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}

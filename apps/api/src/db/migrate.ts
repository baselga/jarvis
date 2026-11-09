import { loadConfig } from '../config.js';
import { runMigrations } from './run-migrations.js';

// Script `pnpm db:migrate`: aplica las migraciones pendientes en la BD de desarrollo.
// Fuera del `try`: un error de configuración sale tal cual, no como fallo de migración.
const config = loadConfig();
try {
  await runMigrations(config.DATABASE_URL);
  console.log('Migraciones al día');
} catch (error) {
  console.error('Error al aplicar las migraciones:', error);
  // Código ≠ 0: el contenedor no arranca el servidor con la BD a medias.
  process.exitCode = 1;
}

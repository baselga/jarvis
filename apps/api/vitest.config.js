import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Desde el host, `TEST_DATABASE_URL` sale del `.env` raíz. `loadEnvFile` no
// sobrescribe variables ya definidas: en el contenedor gana la de Compose.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  // Igual que tsx en desarrollo: importa los paquetes del monorepo desde `src`.
  ssr: { resolve: { conditions: ['development'] } },
  test: {
    // Una vez por ejecución: crea y migra la BD de test.
    globalSetup: ['src/test/global-setup.ts'],
    // En cada archivo: vacía las tablas antes de cada test y cierra la conexión al final.
    setupFiles: ['src/test/setup.ts'],
    // Todos los archivos comparten la BD: en paralelo, uno vaciaría lo que inserta otro.
    fileParallelism: false,
  },
});

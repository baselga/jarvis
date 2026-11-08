import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Igual que tsx en desarrollo: importa los paquetes del monorepo desde `src`.
  ssr: { resolve: { conditions: ['development'] } },
});

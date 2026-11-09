import { defineConfig } from 'drizzle-kit';

// Solo para `drizzle-kit generate`, que compara el esquema con el último snapshot
// sin conectarse a la BD: por eso no lleva credenciales.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
});

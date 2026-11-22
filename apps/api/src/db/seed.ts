import { EmailSchema, PasswordSchema } from '@jarvis/schemas';
import { z } from 'zod';

import { loadConfig } from '../config.js';
import { createDb } from './client.js';
import { seedAdmin } from './seed-admin.js';

// Script `pnpm db:seed`: crea el primer admin a partir de `ADMIN_*`.
// Esquema propio (no en `EnvSchema`): el servidor arranca sin estas variables.
const AdminEnvSchema = z.object({
  ADMIN_EMAIL: EmailSchema,
  ADMIN_PASSWORD: PasswordSchema,
  ADMIN_NAME: z.string().min(1).default('Admin'),
});

const config = loadConfig();
const adminEnv = AdminEnvSchema.safeParse(process.env);

if (!adminEnv.success) {
  console.error(`Variables del admin inválidas:\n${z.prettifyError(adminEnv.error)}`);
  process.exitCode = 1;
} else {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = adminEnv.data;
  const { db, close } = createDb(config.DATABASE_URL);
  try {
    const result = await seedAdmin(db, {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    console.log(
      result === 'created'
        ? `Admin creado: ${ADMIN_EMAIL}`
        : `Ya existe un usuario con ${ADMIN_EMAIL}; no se modifica`,
    );
  } catch (error) {
    console.error('Error al crear el admin:', error);
    process.exitCode = 1;
  } finally {
    await close();
  }
}

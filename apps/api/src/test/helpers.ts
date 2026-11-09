import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '@jarvis/schemas';
import { sql } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { createDb } from '../db/client.js';
import { sessions, users } from '../db/schema/index.js';
import { testDatabaseUrl } from './env.js';

// Una conexión por archivo de test (Vitest aísla los módulos por archivo);
// la cierra `setup.ts` al terminar el archivo.
const testConnection = createDb(testDatabaseUrl());
export const testDb = testConnection.db;
export const closeTestDb = testConnection.close;

// Vacía todas las tablas del esquema `public` (las migraciones viven en `drizzle`).
// Se leen de `pg_tables` para que las tablas nuevas se vacíen sin tocar esto.
export async function resetDb() {
  const rows = await testDb.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await testDb.execute(sql.raw(`truncate ${tables} restart identity cascade`));
}

// App con la BD de test. Quien la usa hace `app.close()` (no cierra la BD).
export function buildTestApp() {
  return buildApp({ db: testDb });
}

let userCounter = 0;

// Inserta un usuario con valores por defecto válidos y únicos.
// Hash de contraseña de relleno: el real (argon2) llega en la tarea 4.
export async function createUser(
  overrides: Partial<{ name: string; email: string; role: Role; active: boolean }> = {},
) {
  userCounter += 1;
  const [user] = await testDb
    .insert(users)
    .values({
      name: `User ${userCounter}`,
      email: `user-${userCounter}@test.local`,
      role: 'adult',
      active: true,
      passwordHash: 'not-a-hash',
      ...overrides,
    })
    .returning();
  return user!;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Inserta una sesión y devuelve el token en claro (lo que tendría el cliente).
// En la BD se guarda su SHA-256; la tarea 5 cambiará esto por la función real de auth.
export async function createSession(userId: string, { expiresAt }: { expiresAt?: Date } = {}) {
  const token = randomBytes(32).toString('base64url');
  const [session] = await testDb
    .insert(sessions)
    .values({
      id: createHash('sha256').update(token).digest('hex'),
      userId,
      expiresAt: expiresAt ?? new Date(Date.now() + THIRTY_DAYS_MS),
    })
    .returning();
  return { token, session: session! };
}

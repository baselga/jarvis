import { createHash, randomBytes } from 'node:crypto';

import { and, eq, lte, ne } from 'drizzle-orm';

import type { Db, DbOrTx } from '../db/client.js';
import { sessions, users } from '../db/schema/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY_MS;
// Solo se renueva cuando queda menos de esto: como mucho un UPDATE cada 15 días por sesión.
export const SESSION_RENEW_THRESHOLD_MS = 15 * DAY_MS;

// 256 bits de azar: inadivinable, por eso basta SHA-256 (argon2 es para contraseñas).
export function generateSessionToken() {
  return randomBytes(32).toString('base64url');
}

// El hash es el `id` de la fila: una fuga de la BD no da tokens utilizables.
export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

// Limpieza sin cron: cada login borra antes las sesiones caducadas de ese usuario.
export async function createSession(db: Db, userId: string, now = new Date()) {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lte(sessions.expiresAt, now)));

  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashSessionToken(token), userId, expiresAt });
  return { token, expiresAt };
}

// Devuelve el usuario de la sesión o null. Las sesiones caducadas o de usuarios
// desactivados se borran al encontrarlas. Si quedan menos de 15 días, renueva a 30.
export async function validateSession(db: Db, token: string, now = new Date()) {
  const id = hashSessionToken(token);
  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      active: users.active,
      user: { id: users.id, name: users.name, email: users.email, role: users.role },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id));

  if (!row) return null;

  if (row.expiresAt <= now || !row.active) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  if (row.expiresAt.getTime() - now.getTime() < SESSION_RENEW_THRESHOLD_MS) {
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    return { user: row.user, expiresAt, renewed: true };
  }

  return { user: row.user, expiresAt: row.expiresAt, renewed: false };
}

// Idempotente: borrar una sesión que no existe no es un error.
export async function deleteSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashSessionToken(token)));
}

// Cierra las sesiones de un usuario (al desactivarlo o cambiar su contraseña),
// salvo la de `exceptToken` si se indica. Acepta una `tx` para borrar en la
// misma transacción que el cambio que lo provoca.
export async function deleteUserSessions(
  db: DbOrTx,
  userId: string,
  { exceptToken }: { exceptToken?: string } = {},
) {
  await db
    .delete(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        exceptToken === undefined ? undefined : ne(sessions.id, hashSessionToken(exceptToken)),
      ),
    );
}

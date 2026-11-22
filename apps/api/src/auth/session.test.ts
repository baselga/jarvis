import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { sessions, users } from '../db/schema/index.js';
import { createSession as insertSession, createUser, testDb } from '../test/helpers.js';
import {
  createSession,
  deleteSession,
  hashSessionToken,
  SESSION_TTL_MS,
  validateSession,
} from './session.js';

const DAY_MS = 24 * 60 * 60 * 1000;

async function findSession(id: string) {
  const [row] = await testDb.select().from(sessions).where(eq(sessions.id, id));
  return row;
}

// Las fechas de la BD y las de los tests no coinciden al milisegundo: basta con estar cerca.
function expectAbout(actual: Date, expected: number) {
  expect(Math.abs(actual.getTime() - expected)).toBeLessThan(5_000);
}

describe('createSession', () => {
  it('guarda el SHA-256 del token, no el token, y caduca en 30 días', async () => {
    const user = await createUser();

    const { token, expiresAt } = await createSession(testDb, user.id);

    const sha256 = createHash('sha256').update(token).digest('hex');
    expect(hashSessionToken(token)).toBe(sha256);
    expect(await findSession(token)).toBeUndefined();
    const row = await findSession(sha256);
    expect(row?.userId).toBe(user.id);
    expectAbout(row!.expiresAt, Date.now() + SESSION_TTL_MS);
    expect(expiresAt.getTime()).toBe(row!.expiresAt.getTime());
  });

  it('borra las sesiones caducadas del usuario y no toca las vigentes ni las de otros', async () => {
    const user = await createUser();
    const other = await createUser();
    const expired = await insertSession(user.id, { expiresAt: new Date(Date.now() - 1000) });
    const current = await insertSession(user.id);
    const otherExpired = await insertSession(other.id, { expiresAt: new Date(Date.now() - 1000) });

    await createSession(testDb, user.id);

    expect(await findSession(expired.session.id)).toBeUndefined();
    expect(await findSession(current.session.id)).toBeDefined();
    expect(await findSession(otherExpired.session.id)).toBeDefined();
  });
});

describe('validateSession', () => {
  it('con un token válido devuelve el usuario y no renueva', async () => {
    const user = await createUser({ name: 'Ana', email: 'ana@test.local', role: 'admin' });
    const { token } = await createSession(testDb, user.id);

    const result = await validateSession(testDb, token);

    expect(result).toMatchObject({
      user: { id: user.id, name: 'Ana', email: 'ana@test.local', role: 'admin' },
      renewed: false,
    });
    expect(result?.user).not.toHaveProperty('passwordHash');
  });

  it('con un token desconocido devuelve null', async () => {
    expect(await validateSession(testDb, 'no-existe')).toBeNull();
  });

  it('con una sesión caducada devuelve null y borra la fila', async () => {
    const user = await createUser();
    const { token, session } = await insertSession(user.id, {
      expiresAt: new Date(Date.now() - 1000),
    });

    expect(await validateSession(testDb, token)).toBeNull();
    expect(await findSession(session.id)).toBeUndefined();
  });

  it('con el usuario desactivado devuelve null y borra la fila', async () => {
    const user = await createUser();
    const { token, session } = await insertSession(user.id);
    await testDb.update(users).set({ active: false }).where(eq(users.id, user.id));

    expect(await validateSession(testDb, token)).toBeNull();
    expect(await findSession(session.id)).toBeUndefined();
  });

  it('con menos de 15 días restantes renueva a 30 días', async () => {
    const user = await createUser();
    const { token, session } = await insertSession(user.id, {
      expiresAt: new Date(Date.now() + 10 * DAY_MS),
    });

    const result = await validateSession(testDb, token);

    expect(result?.renewed).toBe(true);
    const row = await findSession(session.id);
    expectAbout(row!.expiresAt, Date.now() + SESSION_TTL_MS);
    expect(result!.expiresAt.getTime()).toBe(row!.expiresAt.getTime());
  });

  it('con más de 15 días restantes no cambia la caducidad', async () => {
    const user = await createUser();
    const { token, session } = await insertSession(user.id, {
      expiresAt: new Date(Date.now() + 20 * DAY_MS),
    });

    const result = await validateSession(testDb, token);

    expect(result?.renewed).toBe(false);
    const row = await findSession(session.id);
    expect(row!.expiresAt.getTime()).toBe(session.expiresAt.getTime());
  });
});

describe('deleteSession', () => {
  it('borra la sesión y no falla con un token inexistente', async () => {
    const user = await createUser();
    const { token, session } = await insertSession(user.id);

    await deleteSession(testDb, token);

    expect(await findSession(session.id)).toBeUndefined();
    await expect(deleteSession(testDb, token)).resolves.toBeUndefined();
  });
});

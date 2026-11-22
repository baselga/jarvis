import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { verifyPassword } from '../auth/password.js';
import { users } from '../db/schema/index.js';
import { assertTestDatabaseUrl } from './env.js';
import { createSession, createUser, testDb } from './helpers.js';

describe('assertTestDatabaseUrl', () => {
  it('lanza si falta la URL', () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/Falta TEST_DATABASE_URL/);
  });

  it('lanza si el nombre de la BD no termina en _test', () => {
    expect(() => assertTestDatabaseUrl('postgres://u:p@localhost:5432/jarvis')).toThrow(/_test/);
  });

  // El regex es lo que hace seguro interpolar el nombre en `CREATE DATABASE`.
  it.each(['jarvis-dev_test', 'Jarvis_test'])(
    'lanza si el nombre termina en _test pero tiene caracteres no permitidos (%s)',
    (dbName) => {
      expect(() => assertTestDatabaseUrl(`postgres://u:p@localhost:5432/${dbName}`)).toThrow(
        /_test/,
      );
    },
  );

  it('devuelve la URL si apunta a una BD _test', () => {
    const url = 'postgres://u:p@localhost:5432/jarvis_test';
    expect(assertTestDatabaseUrl(url)).toBe(url);
  });
});

describe('createUser', () => {
  it('crea un adulto activo con email en minúsculas y único', async () => {
    const a = await createUser();
    const b = await createUser();

    expect(a).toMatchObject({ role: 'adult', active: true });
    expect(a.email).toBe(a.email.toLowerCase());
    expect(a.email).not.toBe(b.email);
  });

  it('respeta los valores que se le pasan', async () => {
    const user = await createUser({ role: 'guest', active: false });

    expect(user).toMatchObject({ role: 'guest', active: false });
  });

  it('con `password` guarda un hash que verifyPassword acepta', async () => {
    const user = await createUser({ password: 'correcta-123' });

    expect(await verifyPassword(user.passwordHash, 'correcta-123')).toBe(true);
  });
});

describe('createSession', () => {
  it('guarda el SHA-256 del token y caduca en ~30 días', async () => {
    const user = await createUser();

    const { token, session } = await createSession(user.id);

    expect(session.id).toBe(createHash('sha256').update(token).digest('hex'));
    expect(session.id).not.toBe(token);
    const days = (session.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeCloseTo(30, 1);
  });
});

// Los dos tests dependen del orden: el segundo comprueba que el `beforeEach`
// de `setup.ts` vació lo que insertó el primero.
describe('resetDb entre tests', () => {
  it('inserta un usuario', async () => {
    await createUser();
    expect(await testDb.$count(users)).toBe(1);
  });

  it('el siguiente test empieza sin usuarios', async () => {
    expect(await testDb.$count(users)).toBe(0);
  });
});

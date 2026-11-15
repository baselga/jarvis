import { ErrorResponseSchema, type Role } from '@jarvis/schemas';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, createSession, createUser } from '../test/helpers.js';
import { requireRole } from './authenticate.js';
import { SESSION_COOKIE } from './request-token.js';

const DAY_MS = 24 * 60 * 60 * 1000;

let app: FastifyInstance;

// Rutas de prueba: aún no hay endpoints protegidos reales (tarea 7+).
beforeEach(() => {
  app = buildTestApp();
  app.register((protectedApp, _opts, done) => {
    protectedApp.addHook('onRequest', protectedApp.authenticate);
    protectedApp.get('/test/any', (request) => request.user);
    protectedApp.get('/test/admin', { preHandler: requireRole('admin') }, () => ({
      ok: true,
    }));
    protectedApp.get('/test/adult', { preHandler: requireRole('admin', 'adult') }, () => ({
      ok: true,
    }));
    done();
  });
});

afterEach(async () => {
  await app.close();
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

function get(url: string, headers: Record<string, string> = {}, cookies?: Record<string, string>) {
  return app.inject({ method: 'GET', url, headers, cookies });
}

async function tokenFor(role: Role) {
  const user = await createUser({ role });
  const { token } = await createSession(user.id);
  return token;
}

describe('authenticate', () => {
  it('sin token responde 401 «No autenticado»', async () => {
    const res = await get('/test/any');

    expect(res.statusCode).toBe(401);
    expect(ErrorResponseSchema.parse(res.json())).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'No autenticado',
    });
  });

  it('con un Bearer desconocido responde 401', async () => {
    const res = await get('/test/any', bearer('token-que-no-existe'));

    expect(res.statusCode).toBe(401);
  });

  it('con la sesión caducada responde 401', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id, { expiresAt: new Date(Date.now() - 1000) });

    const res = await get('/test/any', bearer(token));

    expect(res.statusCode).toBe(401);
  });

  it('con el usuario desactivado responde 401', async () => {
    const user = await createUser({ active: false });
    const { token } = await createSession(user.id);

    const res = await get('/test/any', bearer(token));

    expect(res.statusCode).toBe(401);
  });

  it('con sesión válida (Bearer y cookie) deja el usuario en request.user', async () => {
    const user = await createUser({ name: 'Ana', email: 'ana@test.local', role: 'guest' });
    const { token } = await createSession(user.id);
    const expected = { id: user.id, name: 'Ana', email: 'ana@test.local', role: 'guest' };

    const byBearer = await get('/test/any', bearer(token));
    const byCookie = await get('/test/any', {}, { [SESSION_COOKIE]: token });

    for (const res of [byBearer, byCookie]) {
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(expected);
    }
  });

  it('por cookie renueva la sesión en cualquier ruta; por Bearer no hay set-cookie', async () => {
    const user = await createUser();
    const expiresAt = new Date(Date.now() + 10 * DAY_MS);
    const { token: cookieToken } = await createSession(user.id, { expiresAt });
    const { token: bearerToken } = await createSession(user.id, { expiresAt });

    const byCookie = await get('/test/any', {}, { [SESSION_COOKIE]: cookieToken });
    const byBearer = await get('/test/any', bearer(bearerToken));

    expect(byCookie.statusCode).toBe(200);
    expect(byCookie.cookies.find((c) => c.name === SESSION_COOKIE)).toMatchObject({
      value: cookieToken,
      maxAge: (30 * DAY_MS) / 1000,
    });
    expect(byBearer.statusCode).toBe(200);
    expect(byBearer.headers['set-cookie']).toBeUndefined();
  });
});

describe('requireRole', () => {
  it.each([
    ['guest', '/test/admin', 403],
    ['adult', '/test/admin', 403],
    ['admin', '/test/admin', 200],
    ['adult', '/test/adult', 200],
    ['admin', '/test/adult', 200],
    ['guest', '/test/adult', 403],
  ] as const)('%s en %s → %i', async (role, url, status) => {
    const res = await get(url, bearer(await tokenFor(role)));

    expect(res.statusCode).toBe(status);
    if (status === 403) {
      expect(ErrorResponseSchema.parse(res.json())).toEqual({
        statusCode: 403,
        error: 'Forbidden',
        message: 'No tienes permiso',
      });
    }
  });

  it('sin token responde 401, no 403: authenticate corre antes', async () => {
    const res = await get('/test/admin');

    expect(res.statusCode).toBe(401);
  });
});

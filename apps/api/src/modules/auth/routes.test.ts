import { ErrorResponseSchema, LoginResponseSchema, MeResponseSchema } from '@jarvis/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SESSION_COOKIE } from '../../auth/request-token.js';
import { users } from '../../db/schema/index.js';
import { buildTestApp, createSession, createUser, testDb } from '../../test/helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PASSWORD = 'contraseña-segura';

let app: FastifyInstance;

beforeEach(() => {
  app = buildTestApp();
});

afterEach(async () => {
  await app.close();
});

function sessionCookie(res: LightMyRequestResponse) {
  return res.cookies.find((c) => c.name === SESSION_COOKIE);
}

function login(email: string, password = PASSWORD, target = app) {
  return target.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
}

function me(headers: Record<string, string> = {}, cookies: Record<string, string> = {}) {
  return app.inject({ method: 'GET', url: '/auth/me', headers, cookies });
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const cookie = (token: string) => ({ [SESSION_COOKIE]: token });

describe('POST /auth/login', () => {
  it('con credenciales correctas devuelve usuario, token y cookie de sesión', async () => {
    const user = await createUser({ name: 'Ana', email: 'ana@test.local', password: PASSWORD });

    const res = await login('ana@test.local');

    expect(res.statusCode).toBe(200);
    const body = LoginResponseSchema.parse(res.json());
    expect(body.user).toEqual({ id: user.id, name: 'Ana', email: 'ana@test.local', role: 'adult' });
    expect(res.json<{ user: object }>().user).not.toHaveProperty('passwordHash');
    const c = sessionCookie(res);
    expect(c).toMatchObject({ value: body.token, httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(c?.secure).toBeUndefined();
  });

  it('acepta el email en mayúsculas y con espacios', async () => {
    await createUser({ email: 'ana@test.local', password: PASSWORD });

    const res = await login('  ANA@Test.Local ');

    expect(res.statusCode).toBe(200);
  });

  it('con contraseña incorrecta o email inexistente responde el mismo 401', async () => {
    await createUser({ email: 'ana@test.local', password: PASSWORD });

    const wrongPassword = await login('ana@test.local', 'otra-contraseña');
    const unknownEmail = await login('nadie@test.local');

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Credenciales incorrectas',
    });
    expect(unknownEmail.json()).toEqual(wrongPassword.json());
    expect(sessionCookie(wrongPassword)).toBeUndefined();
  });

  it('con el usuario desactivado responde 401', async () => {
    await createUser({ email: 'ana@test.local', password: PASSWORD, active: false });

    const res = await login('ana@test.local');

    expect(res.statusCode).toBe(401);
    expect(ErrorResponseSchema.parse(res.json()).message).toBe('Credenciales incorrectas');
  });

  it('sin email o sin contraseña responde 400', async () => {
    const noEmail = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { password: PASSWORD },
    });
    const noPassword = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ana@test.local' },
    });

    expect(noEmail.statusCode).toBe(400);
    expect(noPassword.statusCode).toBe(400);
  });

  it('con cookieSecure la cookie lleva Secure', async () => {
    await createUser({ email: 'ana@test.local', password: PASSWORD });
    const secureApp = buildTestApp({ cookieSecure: true });

    const res = await login('ana@test.local', PASSWORD, secureApp);

    expect(sessionCookie(res)?.secure).toBe(true);
    await secureApp.close();
  });
});

describe('GET /auth/me', () => {
  it('con la cookie del login devuelve el usuario', async () => {
    const user = await createUser({ email: 'ana@test.local', password: PASSWORD });
    const { token } = LoginResponseSchema.parse((await login('ana@test.local')).json());

    const res = await me({}, cookie(token));

    expect(res.statusCode).toBe(200);
    expect(MeResponseSchema.parse(res.json()).user.id).toBe(user.id);
  });

  it('con el token del login como Bearer devuelve el usuario', async () => {
    const user = await createUser({ email: 'ana@test.local', password: PASSWORD });
    const { token } = LoginResponseSchema.parse((await login('ana@test.local')).json());

    const res = await me(bearer(token));

    expect(res.statusCode).toBe(200);
    expect(MeResponseSchema.parse(res.json()).user.id).toBe(user.id);
  });

  it('sin token responde 401', async () => {
    const res = await me();

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'No autenticado',
    });
  });

  it('con la sesión caducada responde 401', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id, { expiresAt: new Date(Date.now() - 1000) });

    expect((await me(bearer(token))).statusCode).toBe(401);
  });

  it('con el usuario desactivado después del login responde 401', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    await testDb.update(users).set({ active: false }).where(eq(users.id, user.id));

    expect((await me(bearer(token))).statusCode).toBe(401);
  });

  it('con Bearer inválido y cookie válida responde 401 (manda la cabecera)', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);

    expect((await me(bearer('no-existe'), cookie(token))).statusCode).toBe(401);
    expect((await me({ authorization: 'Basic abc' }, cookie(token))).statusCode).toBe(401);
  });

  it('por cookie reemite la cookie solo si la sesión se renueva', async () => {
    const user = await createUser();
    const soon = await createSession(user.id, { expiresAt: new Date(Date.now() + 10 * DAY_MS) });
    const later = await createSession(user.id, { expiresAt: new Date(Date.now() + 20 * DAY_MS) });

    const renewed = await me({}, cookie(soon.token));
    const notRenewed = await me({}, cookie(later.token));

    expect(renewed.statusCode).toBe(200);
    expect(sessionCookie(renewed)).toMatchObject({
      value: soon.token,
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: true,
    });
    expect(notRenewed.statusCode).toBe(200);
    expect(notRenewed.headers['set-cookie']).toBeUndefined();
  });
});

describe('POST /auth/logout', () => {
  it('borra la cookie y cierra la sesión (por cookie y por Bearer)', async () => {
    await createUser({ email: 'ana@test.local', password: PASSWORD });
    const { token } = LoginResponseSchema.parse((await login('ana@test.local')).json());

    const res = await app.inject({ method: 'POST', url: '/auth/logout', cookies: cookie(token) });

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    const cleared = sessionCookie(res);
    expect(cleared?.value).toBe('');
    expect(cleared?.path).toBe('/');
    expect((await me({}, cookie(token))).statusCode).toBe(401);
    expect((await me(bearer(token))).statusCode).toBe(401);
  });

  it('sin sesión responde 204', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/logout' });

    expect(res.statusCode).toBe(204);
  });

  it('con Content-Type: application/json y sin cuerpo responde 204', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { 'content-type': 'application/json' },
    });

    expect(res.statusCode).toBe(204);
  });

  it('cierra solo la sesión actual', async () => {
    const user = await createUser();
    const current = await createSession(user.id);
    const other = await createSession(user.id);

    await app.inject({ method: 'POST', url: '/auth/logout', headers: bearer(current.token) });

    expect((await me(bearer(current.token))).statusCode).toBe(401);
    expect((await me(bearer(other.token))).statusCode).toBe(200);
  });
});

describe('PUT /auth/password', () => {
  const NEW_PASSWORD = 'contraseña-nueva';

  function changePassword(token: string | undefined, payload: object) {
    return app.inject({
      method: 'PUT',
      url: '/auth/password',
      headers: token === undefined ? {} : bearer(token),
      payload,
    });
  }

  it('sin token responde 401 y un invitado recibe 403', async () => {
    const guest = await createUser({ role: 'guest' });
    const { token } = await createSession(guest.id);
    const payload = { currentPassword: PASSWORD, newPassword: NEW_PASSWORD };

    expect((await changePassword(undefined, payload)).statusCode).toBe(401);
    expect((await changePassword(token, payload)).statusCode).toBe(403);
  });

  it('cambia la contraseña: la nueva vale en login y la antigua no', async () => {
    await createUser({ email: 'ana@test.local', password: PASSWORD });
    const { token } = LoginResponseSchema.parse((await login('ana@test.local')).json());

    const res = await changePassword(token, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect((await login('ana@test.local', NEW_PASSWORD)).statusCode).toBe(200);
    expect((await login('ana@test.local', PASSWORD)).statusCode).toBe(401);
  });

  it('conserva la sesión actual y cierra las demás', async () => {
    const user = await createUser({ password: PASSWORD });
    const current = await createSession(user.id);
    const other = await createSession(user.id);

    const res = await changePassword(current.token, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(res.statusCode).toBe(204);
    expect((await me(bearer(current.token))).statusCode).toBe(200);
    expect((await me(bearer(other.token))).statusCode).toBe(401);
  });

  it('con la contraseña actual incorrecta responde 400 y no la cambia', async () => {
    const user = await createUser({ password: PASSWORD });
    const { token } = await createSession(user.id);

    const res = await changePassword(token, {
      currentPassword: 'otra-contraseña',
      newPassword: NEW_PASSWORD,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'La contraseña actual no es correcta',
    });
    const [stored] = await testDb.select().from(users).where(eq(users.id, user.id));
    expect(stored?.passwordHash).toBe(user.passwordHash);
  });

  it('con una contraseña nueva de 7 caracteres responde 400', async () => {
    const user = await createUser({ password: PASSWORD });
    const { token } = await createSession(user.id);

    const res = await changePassword(token, { currentPassword: PASSWORD, newPassword: '1234567' });

    expect(res.statusCode).toBe(400);
  });
});

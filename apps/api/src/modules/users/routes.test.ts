import { MeResponseSchema, type Role, UserListResponseSchema, UserSchema } from '@jarvis/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sessions, users } from '../../db/schema/index.js';
import { buildTestApp, createSession, createUser, testDb } from '../../test/helpers.js';

const PASSWORD = 'contraseña-segura';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

let app: FastifyInstance;

beforeEach(() => {
  app = buildTestApp();
});

afterEach(async () => {
  await app.close();
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

// Crea un usuario con sesión y devuelve también la cabecera para usarla.
async function loggedIn(role: Role, overrides: { name?: string } = {}) {
  const user = await createUser({ role, ...overrides });
  const { token } = await createSession(user.id);
  return { user, token, headers: bearer(token) };
}

function me(token: string) {
  return app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
}

const notFound = {
  statusCode: 404,
  error: 'Not Found',
  message: 'Usuario no encontrado',
};

describe('permisos de /users', () => {
  it('sin token GET /users responde 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/users' });

    expect(res.statusCode).toBe(401);
  });

  it.each(['adult', 'guest'] as const)('%s recibe 403 en todas las rutas', async (role) => {
    const { headers } = await loggedIn(role);
    const other = await createUser();

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/users', headers }),
      app.inject({ method: 'GET', url: `/users/${other.id}`, headers }),
      app.inject({
        method: 'POST',
        url: '/users',
        headers,
        payload: { name: 'Nuevo', email: 'nuevo@test.local', role: 'adult', password: PASSWORD },
      }),
      app.inject({
        method: 'PATCH',
        url: `/users/${other.id}`,
        headers,
        payload: { name: 'Otro nombre' },
      }),
    ]);

    expect(responses.map((r) => r.statusCode)).toEqual([403, 403, 403, 403]);
    const [stored] = await testDb.select().from(users).where(eq(users.id, other.id));
    expect(stored?.name).toBe(other.name);
    expect(await testDb.select().from(users).where(eq(users.email, 'nuevo@test.local'))).toEqual(
      [],
    );
  });
});

describe('GET /users', () => {
  it('devuelve todos (también inactivos) ordenados por nombre y sin hash', async () => {
    const { headers } = await loggedIn('admin', { name: 'Admin' });
    await createUser({ name: 'Carla', role: 'guest' });
    await createUser({ name: 'Ana', active: false });
    await createUser({ name: 'Bruno' });

    const res = await app.inject({ method: 'GET', url: '/users', headers });

    expect(res.statusCode).toBe(200);
    const body = UserListResponseSchema.parse(res.json());
    expect(body.users.map((u) => u.name)).toEqual(['Admin', 'Ana', 'Bruno', 'Carla']);
    expect(body.users.find((u) => u.name === 'Ana')?.active).toBe(false);
    for (const user of res.json<{ users: object[] }>().users) {
      expect(user).not.toHaveProperty('passwordHash');
    }
  });
});

describe('GET /users/:id', () => {
  it('devuelve el usuario', async () => {
    const { headers } = await loggedIn('admin');
    const other = await createUser({ name: 'Ana', email: 'ana@test.local', role: 'guest' });

    const res = await app.inject({ method: 'GET', url: `/users/${other.id}`, headers });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: other.id,
      name: 'Ana',
      email: 'ana@test.local',
      role: 'guest',
      active: true,
    });
  });

  it('con un id inexistente responde 404 y con uno mal formado 400', async () => {
    const { headers } = await loggedIn('admin');

    const missing = await app.inject({ method: 'GET', url: `/users/${UNKNOWN_ID}`, headers });
    const malformed = await app.inject({ method: 'GET', url: '/users/no-es-uuid', headers });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual(notFound);
    expect(malformed.statusCode).toBe(400);
  });
});

describe('POST /users', () => {
  it('crea el usuario con el email en minúsculas y puede hacer login', async () => {
    const { headers } = await loggedIn('admin');

    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers,
      payload: { name: ' Ana ', email: ' ANA@Test.Local', role: 'adult', password: PASSWORD },
    });

    expect(res.statusCode).toBe(201);
    const user = UserSchema.parse(res.json());
    expect(user).toMatchObject({
      name: 'Ana',
      email: 'ana@test.local',
      role: 'adult',
      active: true,
    });
    expect(res.json()).not.toHaveProperty('passwordHash');
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ana@test.local', password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
  });

  it('con un email ya existente (en otras mayúsculas) responde 409', async () => {
    const { headers } = await loggedIn('admin');
    await createUser({ email: 'ana@test.local' });

    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers,
      payload: { name: 'Ana', email: 'Ana@Test.Local', role: 'adult', password: PASSWORD },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Ya existe un usuario con ese email',
    });
  });

  it('con contraseña corta o rol inválido responde 400', async () => {
    const { headers } = await loggedIn('admin');
    const base = { name: 'Ana', email: 'ana@test.local', role: 'adult', password: PASSWORD };

    const shortPassword = await app.inject({
      method: 'POST',
      url: '/users',
      headers,
      payload: { ...base, password: '1234567' },
    });
    const badRole = await app.inject({
      method: 'POST',
      url: '/users',
      headers,
      payload: { ...base, role: 'superadmin' },
    });

    expect(shortPassword.statusCode).toBe(400);
    expect(badRole.statusCode).toBe(400);
    expect(await testDb.select().from(users).where(eq(users.email, 'ana@test.local'))).toEqual([]);
  });
});

describe('PATCH /users/:id', () => {
  it('cambia nombre, email y rol', async () => {
    const { headers } = await loggedIn('admin');
    const other = await createUser({ name: 'Ana', role: 'guest' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${other.id}`,
      headers,
      payload: { name: 'Ana María', email: 'ANA.MARIA@test.local', role: 'adult' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: other.id,
      name: 'Ana María',
      email: 'ana.maria@test.local',
      role: 'adult',
      active: true,
    });
  });

  it('con el email de otro usuario responde 409', async () => {
    const { headers } = await loggedIn('admin');
    await createUser({ email: 'ana@test.local' });
    const other = await createUser({ email: 'bruno@test.local' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${other.id}`,
      headers,
      payload: { email: 'ana@test.local' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ message: 'Ya existe un usuario con ese email' });
  });

  it('con cuerpo vacío responde 400 y con un id inexistente 404', async () => {
    const { headers } = await loggedIn('admin');
    const other = await createUser();

    const empty = await app.inject({
      method: 'PATCH',
      url: `/users/${other.id}`,
      headers,
      payload: {},
    });
    const missing = await app.inject({
      method: 'PATCH',
      url: `/users/${UNKNOWN_ID}`,
      headers,
      payload: { name: 'Nadie' },
    });

    expect(empty.statusCode).toBe(400);
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual(notFound);
  });

  it('desactivar un usuario cierra sus sesiones', async () => {
    const { headers } = await loggedIn('admin');
    const other = await loggedIn('adult');

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${other.user.id}`,
      headers,
      payload: { active: false },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ active: false });
    // En la tabla, antes de /auth/me: `validateSession` ya rechaza a los
    // inactivos, así que solo esto prueba que el PATCH borra las sesiones.
    expect(await testDb.select().from(sessions).where(eq(sessions.userId, other.user.id))).toEqual(
      [],
    );
    expect((await me(other.token)).statusCode).toBe(401);
  });

  it('cambiar el rol conserva la sesión y /auth/me ve el rol nuevo', async () => {
    const { headers } = await loggedIn('admin');
    const other = await loggedIn('guest');

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${other.user.id}`,
      headers,
      payload: { role: 'adult' },
    });

    expect(res.statusCode).toBe(200);
    const meRes = await me(other.token);
    expect(meRes.statusCode).toBe(200);
    expect(MeResponseSchema.parse(meRes.json()).user.role).toBe('adult');
  });

  it.each([{ active: false }, { role: 'adult' }])(
    'el admin no puede aplicarse %o a sí mismo (409, sin cambios)',
    async (payload) => {
      const admin = await loggedIn('admin', { name: 'Admin' });

      const res = await app.inject({
        method: 'PATCH',
        url: `/users/${admin.user.id}`,
        headers: admin.headers,
        payload: { ...payload, name: 'Otro nombre' },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: 'No puedes cambiar tu propio rol ni desactivarte',
      });
      const [stored] = await testDb.select().from(users).where(eq(users.id, admin.user.id));
      expect(stored).toMatchObject({ name: 'Admin', role: 'admin', active: true });
      expect((await me(admin.token)).statusCode).toBe(200);
    },
  );

  it('la autoprotección no se salta con el id en mayúsculas', async () => {
    const admin = await loggedIn('admin');

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${admin.user.id.toUpperCase()}`,
      headers: admin.headers,
      payload: { active: false },
    });

    expect(res.statusCode).toBe(409);
    const [stored] = await testDb.select().from(users).where(eq(users.id, admin.user.id));
    expect(stored?.active).toBe(true);
  });

  it('el admin puede editarse reenviando su mismo rol y estado', async () => {
    const admin = await loggedIn('admin', { name: 'Admin' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${admin.user.id}`,
      headers: admin.headers,
      payload: { name: 'Daniel', role: 'admin', active: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Daniel', role: 'admin', active: true });
  });
});

describe('PUT /users/:id/password', () => {
  const NEW_PASSWORD = 'contraseña-nueva';

  function resetPassword(id: string, headers: Record<string, string>, password = NEW_PASSWORD) {
    return app.inject({
      method: 'PUT',
      url: `/users/${id}/password`,
      headers,
      payload: { password },
    });
  }

  function login(email: string, password: string) {
    return app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  }

  it.each(['adult', 'guest'] as const)('%s recibe 403', async (role) => {
    const { headers } = await loggedIn(role);
    const other = await createUser();

    const res = await resetPassword(other.id, headers);

    expect(res.statusCode).toBe(403);
    const [stored] = await testDb.select().from(users).where(eq(users.id, other.id));
    expect(stored?.passwordHash).toBe(other.passwordHash);
  });

  it('cambia la contraseña y cierra todas las sesiones del usuario', async () => {
    const { headers } = await loggedIn('admin');
    const other = await createUser({ email: 'ana@test.local', password: PASSWORD });
    const session = await createSession(other.id);

    const res = await resetPassword(other.id, headers);

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect((await login('ana@test.local', NEW_PASSWORD)).statusCode).toBe(200);
    expect((await login('ana@test.local', PASSWORD)).statusCode).toBe(401);
    expect((await me(session.token)).statusCode).toBe(401);
  });

  it('con un id inexistente responde 404 y con contraseña corta 400', async () => {
    const { headers } = await loggedIn('admin');
    const other = await createUser();

    const missing = await resetPassword(UNKNOWN_ID, headers);
    const short = await resetPassword(other.id, headers, '1234567');

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual(notFound);
    expect(short.statusCode).toBe(400);
  });
});

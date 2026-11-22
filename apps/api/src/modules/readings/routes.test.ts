import type { Reading, ReadingListResponse, Role } from '@jarvis/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { books, readings } from '../../db/schema/index.js';
import {
  buildTestApp,
  createBook,
  createReading,
  createSession,
  createUser,
  testDb,
} from '../../test/helpers.js';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

let app: FastifyInstance;

beforeEach(() => {
  app = buildTestApp();
});

afterEach(async () => {
  await app.close();
});

// Crea un usuario con sesión y devuelve el usuario y la cabecera para usarla.
async function login(role: Role) {
  const user = await createUser({ role });
  const { token } = await createSession(user.id);
  return { user, headers: { authorization: `Bearer ${token}` } };
}

function create(bookId: string, headers: Record<string, string>, payload: object) {
  return app.inject({ method: 'POST', url: `/books/${bookId}/readings`, headers, payload });
}

function patch(id: string, headers: Record<string, string>, payload: object) {
  return app.inject({ method: 'PATCH', url: `/readings/${id}`, headers, payload });
}

function remove(id: string, headers: Record<string, string>) {
  return app.inject({ method: 'DELETE', url: `/readings/${id}`, headers });
}

function list(headers: Record<string, string>, query = '') {
  return app.inject({ method: 'GET', url: `/readings${query}`, headers });
}

async function storedReading(id: string) {
  const [row] = await testDb.select().from(readings).where(eq(readings.id, id));
  return row;
}

describe('permisos de lecturas', () => {
  it('sin token las cuatro rutas responden 401', async () => {
    const owner = await createUser();
    const book = await createBook();
    const reading = await createReading({ bookId: book.id, userId: owner.id });
    const requests = [
      { method: 'GET', url: '/readings' },
      { method: 'POST', url: `/books/${book.id}/readings`, payload: { startedAt: '2026-03-01' } },
      { method: 'PATCH', url: `/readings/${reading.id}`, payload: { rating: 4 } },
      { method: 'DELETE', url: `/readings/${reading.id}` },
    ] as const;

    for (const request of requests) {
      const response = await app.inject(request);
      expect(response.statusCode, `${request.method} ${request.url}`).toBe(401);
    }
  });

  it('un invitado ve las lecturas de la casa', async () => {
    const owner = await createUser();
    const book = await createBook();
    const reading = await createReading({ bookId: book.id, userId: owner.id });
    const { headers } = await login('guest');

    const response = await list(headers);

    expect(response.statusCode).toBe(200);
    const body = response.json<ReadingListResponse>();
    expect(body.readings.map((r) => r.id)).toEqual([reading.id]);
  });

  it('un invitado no puede crear, editar ni borrar y nada cambia', async () => {
    const owner = await createUser();
    const book = await createBook();
    const reading = await createReading({ bookId: book.id, userId: owner.id, rating: 3 });
    const { headers } = await login('guest');

    const responses = [
      await create(book.id, headers, { startedAt: '2026-03-01' }),
      await patch(reading.id, headers, { rating: 5 }),
      await remove(reading.id, headers),
    ];

    for (const response of responses) expect(response.statusCode).toBe(403);
    const rows = await testDb.select().from(readings);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rating).toBe(3);
  });

  it.each(['adult', 'admin'] as const)('un %s crea su lectura', async (role) => {
    const { user, headers } = await login(role);
    const book = await createBook();

    const response = await create(book.id, headers, { startedAt: '2026-03-01' });

    expect(response.statusCode).toBe(201);
    expect(response.json<Reading>()).toMatchObject({ bookId: book.id, userId: user.id });
  });

  it.each(['adult', 'admin'] as const)(
    'un %s no puede editar ni borrar una lectura de otro',
    async (role) => {
      const owner = await createUser();
      const book = await createBook();
      const reading = await createReading({ bookId: book.id, userId: owner.id, rating: 3 });
      const { headers } = await login(role);

      const patched = await patch(reading.id, headers, { rating: 5 });
      const deleted = await remove(reading.id, headers);

      for (const response of [patched, deleted]) {
        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({ message: 'No puedes modificar lecturas de otro' });
      }
      expect((await storedReading(reading.id))?.rating).toBe(3);
    },
  );

  it('el dueño edita y borra su lectura', async () => {
    const { user, headers } = await login('adult');
    const book = await createBook();
    const reading = await createReading({ bookId: book.id, userId: user.id });

    const patched = await patch(reading.id, headers, { rating: 4 });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<Reading>().rating).toBe(4);

    const deleted = await remove(reading.id, headers);
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe('');
    expect(await storedReading(reading.id)).toBeUndefined();
  });
});

describe('POST /books/:id/readings', () => {
  it('solo con inicio queda «leyendo», sin valoración ni nota', async () => {
    const { user, headers } = await login('adult');
    const book = await createBook();

    const response = await create(book.id, headers, { startedAt: '2026-03-01' });

    expect(response.statusCode).toBe(201);
    const { id, ...reading } = response.json<Reading>();
    expect(id).toEqual(expect.any(String));
    expect(reading).toEqual({
      bookId: book.id,
      userId: user.id,
      startedAt: '2026-03-01',
      finishedAt: null,
      rating: null,
      note: null,
    });
  });

  it('rechaza cuerpos inválidos con 400', async () => {
    const { headers } = await login('adult');
    const book = await createBook();
    const payloads = [
      { startedAt: '2026-03-10', finishedAt: '2026-03-01' },
      { startedAt: '2026-03-01', rating: 0 },
      { startedAt: '2026-03-01', rating: 6 },
      { startedAt: '2026-03-01', rating: 3.5 },
      { startedAt: '2026-03-01', note: '   ' },
    ];

    for (const payload of payloads) {
      const response = await create(book.id, headers, payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(await testDb.select().from(readings)).toHaveLength(0);
  });

  it('libro inexistente → 404', async () => {
    const { headers } = await login('adult');

    const response = await create(UNKNOWN_ID, headers, { startedAt: '2026-03-01' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ message: 'Libro no encontrado' });
  });

  it('permite releer: dos lecturas del mismo libro por la misma persona', async () => {
    const { headers } = await login('adult');
    const book = await createBook();

    const first = await create(book.id, headers, { startedAt: '2026-01-01' });
    const second = await create(book.id, headers, { startedAt: '2026-03-01' });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(await testDb.select().from(readings)).toHaveLength(2);
  });
});

// 23:30 UTC del 1 de marzo = 00:30 del 2 de marzo en Madrid (la zona por defecto).
describe('POST /books/:id/readings: fecha por defecto', () => {
  beforeEach(() => {
    // Antes de crear la sesión: su caducidad también usa `Date`.
    vi.setSystemTime(new Date('2026-03-01T23:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sin cuerpo empieza hoy en Madrid y queda «leyendo»', async () => {
    const { headers } = await login('adult');
    const book = await createBook();

    const response = await app.inject({
      method: 'POST',
      url: `/books/${book.id}/readings`,
      headers,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<Reading>()).toMatchObject({ startedAt: '2026-03-02', finishedAt: null });
  });

  it('solo con valoración también empieza hoy', async () => {
    const { headers } = await login('adult');
    const book = await createBook();

    const response = await create(book.id, headers, { rating: 4 });

    expect(response.statusCode).toBe(201);
    expect(response.json<Reading>()).toMatchObject({ startedAt: '2026-03-02', rating: 4 });
  });

  it('solo con fin no rellena el inicio', async () => {
    const { headers } = await login('adult');
    const book = await createBook();

    const response = await create(book.id, headers, { finishedAt: '2026-02-28' });

    expect(response.statusCode).toBe(201);
    expect(response.json<Reading>()).toMatchObject({ startedAt: null, finishedAt: '2026-02-28' });
  });
});

describe('PATCH y DELETE /readings/:id', () => {
  // Lectura de un adulto con sesión, sobre un libro nuevo.
  async function ownReading(overrides: Partial<Parameters<typeof createReading>[0]> = {}) {
    const { user, headers } = await login('adult');
    const book = await createBook();
    const reading = await createReading({ ...overrides, bookId: book.id, userId: user.id });
    return { reading, book, headers };
  }

  it('cambiar solo la valoración deja el resto igual', async () => {
    const { reading, headers } = await ownReading({ rating: 2, note: 'Flojo' });

    const response = await patch(reading.id, headers, { rating: 4 });

    expect(response.statusCode).toBe(200);
    expect(response.json<Reading>()).toMatchObject({
      startedAt: reading.startedAt,
      finishedAt: reading.finishedAt,
      rating: 4,
      note: 'Flojo',
    });
  });

  it('`null` vacía la valoración y la nota', async () => {
    const { reading, headers } = await ownReading({ rating: 2, note: 'Flojo' });

    const response = await patch(reading.id, headers, { rating: null, note: null });

    expect(response.statusCode).toBe(200);
    expect(response.json<Reading>()).toMatchObject({ rating: null, note: null });
  });

  it('cuerpo vacío → 400', async () => {
    const { reading, headers } = await ownReading();

    const response = await patch(reading.id, headers, {});

    expect(response.statusCode).toBe(400);
  });

  it('quitar el inicio de una lectura sin fin → 400 y no cambia', async () => {
    const { reading, headers } = await ownReading({ finishedAt: null });

    const response = await patch(reading.id, headers, { startedAt: null });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      message: 'Indica al menos la fecha de inicio o la de fin',
    });
    expect((await storedReading(reading.id))?.startedAt).toBe(reading.startedAt);
  });

  it('un fin anterior al inicio guardado → 400', async () => {
    const { reading, headers } = await ownReading({ startedAt: '2026-03-10', finishedAt: null });

    const response = await patch(reading.id, headers, { finishedAt: '2026-03-01' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: 'El fin no puede ser anterior al inicio' });
    expect((await storedReading(reading.id))?.finishedAt).toBeNull();
  });

  it('lectura inexistente → 404 en PATCH y DELETE', async () => {
    const { headers } = await login('adult');

    const patched = await patch(UNKNOWN_ID, headers, { rating: 4 });
    const deleted = await remove(UNKNOWN_ID, headers);

    for (const response of [patched, deleted]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ message: 'Lectura no encontrada' });
    }
  });

  it('id no uuid → 400', async () => {
    const { headers } = await login('adult');

    expect((await patch('no-uuid', headers, { rating: 4 })).statusCode).toBe(400);
    expect((await remove('no-uuid', headers)).statusCode).toBe(400);
  });

  it('borrar el libro borra sus lecturas', async () => {
    const { reading, book } = await ownReading();

    await testDb.delete(books).where(eq(books.id, book.id));

    expect(await storedReading(reading.id)).toBeUndefined();
  });
});

describe('GET /readings', () => {
  it('filtra por libro e incluye el nombre del usuario y el título del libro', async () => {
    const ana = await createUser({ name: 'Ana' });
    const luis = await createUser({ name: 'Luis' });
    const dune = await createBook({ title: 'Dune' });
    const other = await createBook();
    await createReading({ bookId: dune.id, userId: ana.id });
    await createReading({ bookId: dune.id, userId: luis.id });
    await createReading({ bookId: other.id, userId: ana.id });
    const { headers } = await login('adult');

    const response = await list(headers, `?bookId=${dune.id}`);

    expect(response.statusCode).toBe(200);
    const body = response.json<ReadingListResponse>();
    expect(body.total).toBe(2);
    expect(body.readings.map((r) => r.user.name).sort()).toEqual(['Ana', 'Luis']);
    for (const reading of body.readings) {
      expect(reading.book).toEqual({ id: dune.id, title: 'Dune' });
    }
  });

  it('filtra por usuario, y por usuario y libro a la vez', async () => {
    const ana = await createUser();
    const luis = await createUser();
    const dune = await createBook();
    const other = await createBook();
    const anaDune = await createReading({ bookId: dune.id, userId: ana.id });
    const anaOther = await createReading({ bookId: other.id, userId: ana.id });
    await createReading({ bookId: dune.id, userId: luis.id });
    const { headers } = await login('adult');

    const byUser = (await list(headers, `?userId=${ana.id}`)).json<ReadingListResponse>();
    const both = (
      await list(headers, `?userId=${ana.id}&bookId=${dune.id}`)
    ).json<ReadingListResponse>();

    expect(byUser.readings.map((r) => r.id).sort()).toEqual([anaDune.id, anaOther.id].sort());
    expect(both.readings.map((r) => r.id)).toEqual([anaDune.id]);
  });

  it('incluye las lecturas de usuarios desactivados', async () => {
    const former = await createUser({ name: 'Antiguo', active: false });
    const book = await createBook();
    const reading = await createReading({ bookId: book.id, userId: former.id });
    const { headers } = await login('adult');

    const body = (await list(headers)).json<ReadingListResponse>();

    expect(body.total).toBe(1);
    expect(body.readings[0]).toMatchObject({ id: reading.id, user: { name: 'Antiguo' } });
  });

  it('ordena: «leyendo» primero y luego por fin descendente', async () => {
    const user = await createUser();
    const book = await createBook();
    const old = await createReading({ bookId: book.id, userId: user.id, finishedAt: '2026-01-20' });
    const current = await createReading({ bookId: book.id, userId: user.id, finishedAt: null });
    const recent = await createReading({
      bookId: book.id,
      userId: user.id,
      finishedAt: '2026-05-20',
    });
    const { headers } = await login('guest');

    const body = (await list(headers)).json<ReadingListResponse>();

    expect(body.readings.map((r) => r.id)).toEqual([current.id, recent.id, old.id]);
  });

  it('`limit` y `offset` paginan y `total` cuenta todas las del filtro', async () => {
    const user = await createUser();
    const book = await createBook();
    const finished = ['2026-01-20', '2026-02-20', '2026-03-20', '2026-04-20'];
    const created = [];
    for (const finishedAt of finished) {
      created.push(await createReading({ bookId: book.id, userId: user.id, finishedAt }));
    }
    await createReading({ bookId: (await createBook()).id, userId: user.id });
    const { headers } = await login('adult');

    const body = (
      await list(headers, `?bookId=${book.id}&limit=2&offset=1`)
    ).json<ReadingListResponse>();

    expect(body.total).toBe(4);
    expect(body.readings.map((r) => r.id)).toEqual([created[2]!.id, created[1]!.id]);
  });

  it('`bookId` no uuid → 400; id inexistente → lista vacía', async () => {
    const { headers } = await login('adult');

    expect((await list(headers, '?bookId=no-uuid')).statusCode).toBe(400);
    const response = await list(headers, `?bookId=${UNKNOWN_ID}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ readings: [], total: 0 });
  });
});

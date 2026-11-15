import type { Role } from '@jarvis/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { genres, bookGenres } from '../../db/schema/index.js';
import {
  buildTestApp,
  createGenre,
  createBook,
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

// Crea un usuario con sesión y devuelve la cabecera para usarla.
async function headersFor(role: Role) {
  const user = await createUser({ role });
  const { token } = await createSession(user.id);
  return { authorization: `Bearer ${token}` };
}

describe('permisos de /genres', () => {
  it('sin token las cinco rutas responden 401', async () => {
    const genre = await createGenre();

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/genres' }),
      app.inject({ method: 'GET', url: `/genres/${genre.id}` }),
      app.inject({ method: 'POST', url: '/genres', payload: { name: 'Nuevo' } }),
      app.inject({ method: 'PATCH', url: `/genres/${genre.id}`, payload: { name: 'Otro' } }),
      app.inject({ method: 'DELETE', url: `/genres/${genre.id}` }),
    ]);

    expect(responses.map((r) => r.statusCode)).toEqual([401, 401, 401, 401, 401]);
  });

  it('un invitado puede leer el listado y el detalle', async () => {
    const headers = await headersFor('guest');
    const genre = await createGenre({ name: 'Ciencia ficción' });

    const list = await app.inject({ method: 'GET', url: '/genres', headers });
    const detail = await app.inject({ method: 'GET', url: `/genres/${genre.id}`, headers });

    expect(list.statusCode).toBe(200);
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toEqual({ id: genre.id, name: 'Ciencia ficción' });
  });

  it('un invitado recibe 403 al crear, editar y borrar, y el género no cambia', async () => {
    const headers = await headersFor('guest');
    const genre = await createGenre({ name: 'Original' });

    const post = await app.inject({
      method: 'POST',
      url: '/genres',
      headers,
      payload: { name: 'Nuevo' },
    });
    const patch = await app.inject({
      method: 'PATCH',
      url: `/genres/${genre.id}`,
      headers,
      payload: { name: 'Cambiado' },
    });
    const del = await app.inject({ method: 'DELETE', url: `/genres/${genre.id}`, headers });

    expect([post.statusCode, patch.statusCode, del.statusCode]).toEqual([403, 403, 403]);
    const rows = await testDb.select().from(genres);
    expect(rows).toEqual([expect.objectContaining({ id: genre.id, name: 'Original' })]);
  });

  it.each(['admin', 'adult'] as const)('%s crea, edita y borra', async (role) => {
    const headers = await headersFor(role);

    const created = await app.inject({
      method: 'POST',
      url: '/genres',
      headers,
      payload: { name: 'Nuevo' },
    });
    const { id } = created.json<{ id: string }>();
    const patched = await app.inject({
      method: 'PATCH',
      url: `/genres/${id}`,
      headers,
      payload: { name: 'Editado' },
    });
    const deleted = await app.inject({ method: 'DELETE', url: `/genres/${id}`, headers });

    expect([created.statusCode, patched.statusCode, deleted.statusCode]).toEqual([201, 200, 204]);
  });
});

describe('CRUD de /genres', () => {
  it('POST recorta espacios y devuelve 201 con id y name', async () => {
    const headers = await headersFor('adult');

    const res = await app.inject({
      method: 'POST',
      url: '/genres',
      headers,
      payload: { name: '  Fantasía  ' },
    });

    expect(res.statusCode).toBe(201);
    const [stored] = await testDb.select().from(genres);
    expect(res.json()).toEqual({ id: stored!.id, name: 'Fantasía' });
  });

  it.each(['', '   '])('POST con nombre %j responde 400', async (name) => {
    const headers = await headersFor('adult');

    const res = await app.inject({ method: 'POST', url: '/genres', headers, payload: { name } });

    expect(res.statusCode).toBe(400);
  });

  it('POST con un nombre que solo difiere en mayúsculas responde 409', async () => {
    const headers = await headersFor('adult');
    await createGenre({ name: 'Ciencia ficción' });

    const res = await app.inject({
      method: 'POST',
      url: '/genres',
      headers,
      payload: { name: 'CIENCIA FICCIÓN' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ message: 'Ya existe un género con ese nombre' });
  });

  it('GET de un id inexistente responde 404 y de uno mal formado, 400', async () => {
    const headers = await headersFor('adult');

    const missing = await app.inject({ method: 'GET', url: `/genres/${UNKNOWN_ID}`, headers });
    const malformed = await app.inject({ method: 'GET', url: '/genres/no-es-un-uuid', headers });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ message: 'Género no encontrado' });
    expect(malformed.statusCode).toBe(400);
  });

  it.each(['PATCH', 'DELETE'] as const)('%s con un id mal formado responde 400', async (method) => {
    const headers = await headersFor('adult');

    const res = await app.inject({
      method,
      url: '/genres/no-es-un-uuid',
      headers,
      ...(method === 'PATCH' && { payload: { name: 'Nuevo' } }),
    });

    expect(res.statusCode).toBe(400);
  });

  describe('PATCH', () => {
    it('cambia el nombre', async () => {
      const headers = await headersFor('adult');
      const genre = await createGenre({ name: 'Antes' });

      const res = await app.inject({
        method: 'PATCH',
        url: `/genres/${genre.id}`,
        headers,
        payload: { name: 'Después' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ id: genre.id, name: 'Después' });
    });

    it('a un nombre usado por otro género responde 409', async () => {
      const headers = await headersFor('adult');
      await createGenre({ name: 'Ocupado' });
      const genre = await createGenre({ name: 'Libre' });

      const res = await app.inject({
        method: 'PATCH',
        url: `/genres/${genre.id}`,
        headers,
        payload: { name: 'ocupado' },
      });

      expect(res.statusCode).toBe(409);
    });

    it('al mismo nombre o cambiando solo las mayúsculas del propio responde 200', async () => {
      const headers = await headersFor('adult');
      const genre = await createGenre({ name: 'Mismo Nombre' });
      const patch = (name: string) =>
        app.inject({ method: 'PATCH', url: `/genres/${genre.id}`, headers, payload: { name } });

      const same = await patch('Mismo Nombre');
      const recased = await patch('MISMO NOMBRE');

      expect(same.statusCode).toBe(200);
      expect(recased.statusCode).toBe(200);
      expect(recased.json()).toEqual({ id: genre.id, name: 'MISMO NOMBRE' });
    });

    it('de un id inexistente responde 404', async () => {
      const headers = await headersFor('adult');

      const res = await app.inject({
        method: 'PATCH',
        url: `/genres/${UNKNOWN_ID}`,
        headers,
        payload: { name: 'Da igual' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE', () => {
    it('de un género sin libros responde 204 y después GET responde 404', async () => {
      const headers = await headersFor('adult');
      const genre = await createGenre();

      const del = await app.inject({ method: 'DELETE', url: `/genres/${genre.id}`, headers });
      const get = await app.inject({ method: 'GET', url: `/genres/${genre.id}`, headers });

      expect(del.statusCode).toBe(204);
      expect(get.statusCode).toBe(404);
    });

    it('de un id inexistente responde 404', async () => {
      const headers = await headersFor('adult');

      const res = await app.inject({ method: 'DELETE', url: `/genres/${UNKNOWN_ID}`, headers });

      expect(res.statusCode).toBe(404);
    });

    it('de un género con libros responde 409 y el género y su vínculo siguen ahí', async () => {
      const headers = await headersFor('adult');
      const genre = await createGenre();
      const book = await createBook({ genreIds: [genre.id] });

      const res = await app.inject({ method: 'DELETE', url: `/genres/${genre.id}`, headers });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({
        message: 'No se puede borrar: el género tiene libros',
      });
      expect(await testDb.select().from(genres).where(eq(genres.id, genre.id))).toHaveLength(1);
      expect(await testDb.select().from(bookGenres)).toEqual([
        { bookId: book.id, genreId: genre.id },
      ]);
    });
  });
});

describe('listado de /genres', () => {
  const list = async (query: string) => {
    const headers = await headersFor('guest');
    return app.inject({ method: 'GET', url: `/genres${query}`, headers });
  };
  const names = (res: Awaited<ReturnType<typeof list>>) =>
    res.json<{ genres: { name: string }[] }>().genres.map((a) => a.name);

  it('va ordenado por nombre e incluye el total', async () => {
    await createGenre({ name: 'Terror' });
    await createGenre({ name: 'Aventura' });
    await createGenre({ name: 'Novela' });

    const res = await list('');

    expect(res.statusCode).toBe(200);
    expect(names(res)).toEqual(['Aventura', 'Novela', 'Terror']);
    expect(res.json()).toMatchObject({ total: 3 });
  });

  it('q filtra sin distinguir mayúsculas y total cuenta solo los coincidentes', async () => {
    await createGenre({ name: 'Novela negra' });
    await createGenre({ name: 'Relato NEGRA' });
    await createGenre({ name: 'Poesía' });

    const res = await list('?q=negra');

    expect(names(res)).toEqual(['Novela negra', 'Relato NEGRA']);
    expect(res.json()).toMatchObject({ total: 2 });
  });

  it.each(['%', '_'])('q=%s solo coincide con nombres que contienen ese carácter', async (q) => {
    await createGenre({ name: '100% Real' });
    await createGenre({ name: 'a_b' });
    await createGenre({ name: 'Normal' });

    const res = await list(`?q=${encodeURIComponent(q)}`);

    expect(names(res)).toEqual([q === '%' ? '100% Real' : 'a_b']);
    expect(res.json()).toMatchObject({ total: 1 });
  });

  it('limit y offset paginan sin repetir ni saltar, con total constante', async () => {
    for (const name of ['E', 'D', 'C', 'B', 'A']) await createGenre({ name });

    const pages = await Promise.all([
      list('?limit=2'),
      list('?limit=2&offset=2'),
      list('?limit=2&offset=4'),
    ]);

    expect(pages.map(names)).toEqual([['A', 'B'], ['C', 'D'], ['E']]);
    expect(pages.map((p) => p.json<{ total: number }>().total)).toEqual([5, 5, 5]);
  });

  it.each(['?limit=201', '?limit=0', '?offset=-1', '?q=', '?q=%20'])(
    '%s responde 400',
    async (query) => {
      const res = await list(query);

      expect(res.statusCode).toBe(400);
    },
  );
});

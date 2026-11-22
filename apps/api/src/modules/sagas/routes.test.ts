import type { Role } from '@jarvis/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { books, sagas } from '../../db/schema/index.js';
import {
  buildTestApp,
  createBook,
  createSaga,
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

describe('permisos de /sagas', () => {
  it('sin token las cinco rutas responden 401', async () => {
    const saga = await createSaga();

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/sagas' }),
      app.inject({ method: 'GET', url: `/sagas/${saga.id}` }),
      app.inject({ method: 'POST', url: '/sagas', payload: { name: 'Nuevo' } }),
      app.inject({ method: 'PATCH', url: `/sagas/${saga.id}`, payload: { name: 'Otro' } }),
      app.inject({ method: 'DELETE', url: `/sagas/${saga.id}` }),
    ]);

    expect(responses.map((r) => r.statusCode)).toEqual([401, 401, 401, 401, 401]);
  });

  it('un invitado puede leer el listado y el detalle', async () => {
    const headers = await headersFor('guest');
    const saga = await createSaga({ name: 'Fundación' });

    const list = await app.inject({ method: 'GET', url: '/sagas', headers });
    const detail = await app.inject({ method: 'GET', url: `/sagas/${saga.id}`, headers });

    expect(list.statusCode).toBe(200);
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toEqual({ id: saga.id, name: 'Fundación', books: [] });
  });

  it('un invitado recibe 403 al crear, editar y borrar, y la saga no cambia', async () => {
    const headers = await headersFor('guest');
    const saga = await createSaga({ name: 'Original' });

    const post = await app.inject({
      method: 'POST',
      url: '/sagas',
      headers,
      payload: { name: 'Nuevo' },
    });
    const patch = await app.inject({
      method: 'PATCH',
      url: `/sagas/${saga.id}`,
      headers,
      payload: { name: 'Cambiado' },
    });
    const del = await app.inject({ method: 'DELETE', url: `/sagas/${saga.id}`, headers });

    expect([post.statusCode, patch.statusCode, del.statusCode]).toEqual([403, 403, 403]);
    const rows = await testDb.select().from(sagas);
    expect(rows).toEqual([expect.objectContaining({ id: saga.id, name: 'Original' })]);
  });

  it.each(['admin', 'adult'] as const)('%s crea, edita y borra', async (role) => {
    const headers = await headersFor(role);

    const created = await app.inject({
      method: 'POST',
      url: '/sagas',
      headers,
      payload: { name: 'Nuevo' },
    });
    const { id } = created.json<{ id: string }>();
    const patched = await app.inject({
      method: 'PATCH',
      url: `/sagas/${id}`,
      headers,
      payload: { name: 'Editado' },
    });
    const deleted = await app.inject({ method: 'DELETE', url: `/sagas/${id}`, headers });

    expect([created.statusCode, patched.statusCode, deleted.statusCode]).toEqual([201, 200, 204]);
  });
});

describe('CRUD de /sagas', () => {
  it('POST recorta espacios y devuelve 201 con id y name', async () => {
    const headers = await headersFor('adult');

    const res = await app.inject({
      method: 'POST',
      url: '/sagas',
      headers,
      payload: { name: '  Dune  ' },
    });

    expect(res.statusCode).toBe(201);
    const [stored] = await testDb.select().from(sagas);
    expect(res.json()).toEqual({ id: stored!.id, name: 'Dune' });
  });

  it.each(['', '   '])('POST con nombre %j responde 400', async (name) => {
    const headers = await headersFor('adult');

    const res = await app.inject({ method: 'POST', url: '/sagas', headers, payload: { name } });

    expect(res.statusCode).toBe(400);
  });

  it('POST con un nombre que solo difiere en mayúsculas responde 409', async () => {
    const headers = await headersFor('adult');
    await createSaga({ name: 'Fundación' });

    const res = await app.inject({
      method: 'POST',
      url: '/sagas',
      headers,
      payload: { name: 'FUNDACIÓN' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ message: 'Ya existe una saga con ese nombre' });
  });

  it('GET de un id inexistente responde 404 y de uno mal formado, 400', async () => {
    const headers = await headersFor('adult');

    const missing = await app.inject({ method: 'GET', url: `/sagas/${UNKNOWN_ID}`, headers });
    const malformed = await app.inject({ method: 'GET', url: '/sagas/no-es-un-uuid', headers });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ message: 'Saga no encontrada' });
    expect(malformed.statusCode).toBe(400);
  });

  it.each(['PATCH', 'DELETE'] as const)('%s con un id mal formado responde 400', async (method) => {
    const headers = await headersFor('adult');

    const res = await app.inject({
      method,
      url: '/sagas/no-es-un-uuid',
      headers,
      ...(method === 'PATCH' && { payload: { name: 'Nuevo' } }),
    });

    expect(res.statusCode).toBe(400);
  });

  describe('PATCH', () => {
    it('cambia el nombre', async () => {
      const headers = await headersFor('adult');
      const saga = await createSaga({ name: 'Antes' });

      const res = await app.inject({
        method: 'PATCH',
        url: `/sagas/${saga.id}`,
        headers,
        payload: { name: 'Después' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ id: saga.id, name: 'Después' });
    });

    it('a un nombre usado por otra saga responde 409', async () => {
      const headers = await headersFor('adult');
      await createSaga({ name: 'Ocupado' });
      const saga = await createSaga({ name: 'Libre' });

      const res = await app.inject({
        method: 'PATCH',
        url: `/sagas/${saga.id}`,
        headers,
        payload: { name: 'ocupado' },
      });

      expect(res.statusCode).toBe(409);
    });

    it('al mismo nombre o cambiando solo las mayúsculas del propio responde 200', async () => {
      const headers = await headersFor('adult');
      const saga = await createSaga({ name: 'Mismo Nombre' });
      const patch = (name: string) =>
        app.inject({ method: 'PATCH', url: `/sagas/${saga.id}`, headers, payload: { name } });

      const same = await patch('Mismo Nombre');
      const recased = await patch('MISMO NOMBRE');

      expect(same.statusCode).toBe(200);
      expect(recased.statusCode).toBe(200);
      expect(recased.json()).toEqual({ id: saga.id, name: 'MISMO NOMBRE' });
    });

    it('de un id inexistente responde 404', async () => {
      const headers = await headersFor('adult');

      const res = await app.inject({
        method: 'PATCH',
        url: `/sagas/${UNKNOWN_ID}`,
        headers,
        payload: { name: 'Da igual' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE', () => {
    it('de una saga sin libros responde 204 y después GET responde 404', async () => {
      const headers = await headersFor('adult');
      const saga = await createSaga();

      const del = await app.inject({ method: 'DELETE', url: `/sagas/${saga.id}`, headers });
      const get = await app.inject({ method: 'GET', url: `/sagas/${saga.id}`, headers });

      expect(del.statusCode).toBe(204);
      expect(get.statusCode).toBe(404);
    });

    it('de un id inexistente responde 404', async () => {
      const headers = await headersFor('adult');

      const res = await app.inject({ method: 'DELETE', url: `/sagas/${UNKNOWN_ID}`, headers });

      expect(res.statusCode).toBe(404);
    });

    it('de una saga con libros responde 409 y la saga y su vínculo siguen ahí', async () => {
      const headers = await headersFor('adult');
      const saga = await createSaga();
      const book = await createBook({ sagaId: saga.id });

      const res = await app.inject({ method: 'DELETE', url: `/sagas/${saga.id}`, headers });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({
        message: 'No se puede borrar: la saga tiene libros',
      });
      expect(await testDb.select().from(sagas).where(eq(sagas.id, saga.id))).toHaveLength(1);
      const [stored] = await testDb.select().from(books).where(eq(books.id, book.id));
      expect(stored!.sagaId).toBe(saga.id);
    });
  });
});

describe('listado de /sagas', () => {
  const list = async (query: string) => {
    const headers = await headersFor('guest');
    return app.inject({ method: 'GET', url: `/sagas${query}`, headers });
  };
  const names = (res: Awaited<ReturnType<typeof list>>) =>
    res.json<{ sagas: { name: string }[] }>().sagas.map((a) => a.name);

  it('va ordenado por nombre e incluye el total', async () => {
    await createSaga({ name: 'Trilogía' });
    await createSaga({ name: 'Aventuras' });
    await createSaga({ name: 'Novelas' });

    const res = await list('');

    expect(res.statusCode).toBe(200);
    expect(names(res)).toEqual(['Aventuras', 'Novelas', 'Trilogía']);
    expect(res.json()).toMatchObject({ total: 3 });
  });

  it('q filtra sin distinguir mayúsculas y total cuenta solo los coincidentes', async () => {
    await createSaga({ name: 'Novela negra' });
    await createSaga({ name: 'Relato NEGRA' });
    await createSaga({ name: 'Poesía' });

    const res = await list('?q=negra');

    expect(names(res)).toEqual(['Novela negra', 'Relato NEGRA']);
    expect(res.json()).toMatchObject({ total: 2 });
  });

  it('q ignora tildes y la ñ: «senor» encuentra «El Señor de los Anillos»', async () => {
    await createSaga({ name: 'El Señor de los Anillos' });
    await createSaga({ name: 'Dune' });

    const res = await list('?q=senor');

    expect(names(res)).toEqual(['El Señor de los Anillos']);
    expect(res.json()).toMatchObject({ total: 1 });
  });

  it.each(['%', '_'])('q=%s solo coincide con nombres que contienen ese carácter', async (q) => {
    await createSaga({ name: '100% Real' });
    await createSaga({ name: 'a_b' });
    await createSaga({ name: 'Normal' });

    const res = await list(`?q=${encodeURIComponent(q)}`);

    expect(names(res)).toEqual([q === '%' ? '100% Real' : 'a_b']);
    expect(res.json()).toMatchObject({ total: 1 });
  });

  it('limit y offset paginan sin repetir ni saltar, con total constante', async () => {
    for (const name of ['E', 'D', 'C', 'B', 'A']) await createSaga({ name });

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

describe('detalle de /sagas/:id', () => {
  const detail = async (id: string) => {
    const headers = await headersFor('guest');
    return app.inject({ method: 'GET', url: `/sagas/${id}`, headers });
  };
  const titles = (res: Awaited<ReturnType<typeof detail>>) =>
    res.json<{ books: { title: string }[] }>().books.map((b) => b.title);

  it('devuelve id, name y los libros con los campos de BookSchema', async () => {
    const saga = await createSaga({ name: 'Fundación' });
    const book = await createBook({ title: 'Fundación', sagaId: saga.id, sagaOrder: 1 });

    const res = await detail(saga.id);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: saga.id,
      name: 'Fundación',
      books: [
        {
          id: book.id,
          title: 'Fundación',
          sagaId: saga.id,
          sagaOrder: 1,
          isbn: null,
          year: null,
          language: null,
          location: null,
          notes: null,
        },
      ],
    });
  });

  it('una saga sin libros devuelve books vacío', async () => {
    const saga = await createSaga();

    const res = await detail(saga.id);

    expect(res.json()).toMatchObject({ books: [] });
  });

  it('ordena por sagaOrder ascendente aunque se creen en otro orden', async () => {
    const saga = await createSaga();
    await createBook({ title: 'Tres', sagaId: saga.id, sagaOrder: 3 });
    await createBook({ title: 'Uno', sagaId: saga.id, sagaOrder: 1 });
    await createBook({ title: 'Dos y medio', sagaId: saga.id, sagaOrder: 2.5 });
    await createBook({ title: 'Dos', sagaId: saga.id, sagaOrder: 2 });

    const res = await detail(saga.id);

    expect(titles(res)).toEqual(['Uno', 'Dos', 'Dos y medio', 'Tres']);
  });

  it('un libro sin sagaOrder sale después de los que lo tienen', async () => {
    const saga = await createSaga();
    await createBook({ title: 'A sin orden', sagaId: saga.id });
    await createBook({ title: 'Z con orden', sagaId: saga.id, sagaOrder: 9 });

    const res = await detail(saga.id);

    expect(titles(res)).toEqual(['Z con orden', 'A sin orden']);
  });

  it('dos libros con el mismo sagaOrder salen por título', async () => {
    const saga = await createSaga();
    await createBook({ title: 'Beta', sagaId: saga.id, sagaOrder: 1 });
    await createBook({ title: 'Alfa', sagaId: saga.id, sagaOrder: 1 });

    const res = await detail(saga.id);

    expect(titles(res)).toEqual(['Alfa', 'Beta']);
  });

  it('no incluye libros de otra saga ni libros sin saga', async () => {
    const saga = await createSaga();
    const other = await createSaga();
    await createBook({ title: 'Mío', sagaId: saga.id, sagaOrder: 1 });
    await createBook({ title: 'De otra', sagaId: other.id, sagaOrder: 1 });
    await createBook({ title: 'Suelto' });

    const res = await detail(saga.id);

    expect(titles(res)).toEqual(['Mío']);
  });

  it('el listado GET /sagas no incluye books', async () => {
    const saga = await createSaga();
    await createBook({ sagaId: saga.id });
    const headers = await headersFor('guest');

    const res = await app.inject({ method: 'GET', url: '/sagas', headers });

    expect(res.json()).toEqual({ sagas: [{ id: saga.id, name: saga.name }], total: 1 });
  });
});

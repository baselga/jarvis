import type { Role } from '@jarvis/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authors, bookAuthors } from '../../db/schema/index.js';
import {
  buildTestApp,
  createAuthor,
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

describe('permisos de /authors', () => {
  it('sin token las cinco rutas responden 401', async () => {
    const author = await createAuthor();

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/authors' }),
      app.inject({ method: 'GET', url: `/authors/${author.id}` }),
      app.inject({ method: 'POST', url: '/authors', payload: { name: 'Nuevo' } }),
      app.inject({ method: 'PATCH', url: `/authors/${author.id}`, payload: { name: 'Otro' } }),
      app.inject({ method: 'DELETE', url: `/authors/${author.id}` }),
    ]);

    expect(responses.map((r) => r.statusCode)).toEqual([401, 401, 401, 401, 401]);
  });

  it('un invitado puede leer el listado y el detalle', async () => {
    const headers = await headersFor('guest');
    const author = await createAuthor({ name: 'Ursula K. Le Guin' });

    const list = await app.inject({ method: 'GET', url: '/authors', headers });
    const detail = await app.inject({ method: 'GET', url: `/authors/${author.id}`, headers });

    expect(list.statusCode).toBe(200);
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toEqual({ id: author.id, name: 'Ursula K. Le Guin' });
  });

  it('un invitado recibe 403 al crear, editar y borrar, y el autor no cambia', async () => {
    const headers = await headersFor('guest');
    const author = await createAuthor({ name: 'Original' });

    const post = await app.inject({
      method: 'POST',
      url: '/authors',
      headers,
      payload: { name: 'Nuevo' },
    });
    const patch = await app.inject({
      method: 'PATCH',
      url: `/authors/${author.id}`,
      headers,
      payload: { name: 'Cambiado' },
    });
    const del = await app.inject({ method: 'DELETE', url: `/authors/${author.id}`, headers });

    expect([post.statusCode, patch.statusCode, del.statusCode]).toEqual([403, 403, 403]);
    const rows = await testDb.select().from(authors);
    expect(rows).toEqual([expect.objectContaining({ id: author.id, name: 'Original' })]);
  });

  it.each(['admin', 'adult'] as const)('%s crea, edita y borra', async (role) => {
    const headers = await headersFor(role);

    const created = await app.inject({
      method: 'POST',
      url: '/authors',
      headers,
      payload: { name: 'Nuevo' },
    });
    const { id } = created.json<{ id: string }>();
    const patched = await app.inject({
      method: 'PATCH',
      url: `/authors/${id}`,
      headers,
      payload: { name: 'Editado' },
    });
    const deleted = await app.inject({ method: 'DELETE', url: `/authors/${id}`, headers });

    expect([created.statusCode, patched.statusCode, deleted.statusCode]).toEqual([201, 200, 204]);
  });
});

describe('CRUD de /authors', () => {
  it('POST recorta espacios y devuelve 201 con id y name', async () => {
    const headers = await headersFor('adult');

    const res = await app.inject({
      method: 'POST',
      url: '/authors',
      headers,
      payload: { name: '  Isaac Asimov  ' },
    });

    expect(res.statusCode).toBe(201);
    const [stored] = await testDb.select().from(authors);
    expect(res.json()).toEqual({ id: stored!.id, name: 'Isaac Asimov' });
  });

  it.each(['', '   '])('POST con nombre %j responde 400', async (name) => {
    const headers = await headersFor('adult');

    const res = await app.inject({ method: 'POST', url: '/authors', headers, payload: { name } });

    expect(res.statusCode).toBe(400);
  });

  it('POST con un nombre que solo difiere en mayúsculas responde 409', async () => {
    const headers = await headersFor('adult');
    await createAuthor({ name: 'Ursula K. Le Guin' });

    const res = await app.inject({
      method: 'POST',
      url: '/authors',
      headers,
      payload: { name: 'URSULA k. le guin' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ message: 'Ya existe un autor con ese nombre' });
  });

  it('GET de un id inexistente responde 404 y de uno mal formado, 400', async () => {
    const headers = await headersFor('adult');

    const missing = await app.inject({ method: 'GET', url: `/authors/${UNKNOWN_ID}`, headers });
    const malformed = await app.inject({ method: 'GET', url: '/authors/no-es-un-uuid', headers });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ message: 'Autor no encontrado' });
    expect(malformed.statusCode).toBe(400);
  });

  it.each(['PATCH', 'DELETE'] as const)('%s con un id mal formado responde 400', async (method) => {
    const headers = await headersFor('adult');

    const res = await app.inject({
      method,
      url: '/authors/no-es-un-uuid',
      headers,
      ...(method === 'PATCH' && { payload: { name: 'Nuevo' } }),
    });

    expect(res.statusCode).toBe(400);
  });

  describe('PATCH', () => {
    it('cambia el nombre', async () => {
      const headers = await headersFor('adult');
      const author = await createAuthor({ name: 'Antes' });

      const res = await app.inject({
        method: 'PATCH',
        url: `/authors/${author.id}`,
        headers,
        payload: { name: 'Después' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ id: author.id, name: 'Después' });
    });

    it('a un nombre usado por otro autor responde 409', async () => {
      const headers = await headersFor('adult');
      await createAuthor({ name: 'Ocupado' });
      const author = await createAuthor({ name: 'Libre' });

      const res = await app.inject({
        method: 'PATCH',
        url: `/authors/${author.id}`,
        headers,
        payload: { name: 'ocupado' },
      });

      expect(res.statusCode).toBe(409);
    });

    it('al mismo nombre o cambiando solo las mayúsculas del propio responde 200', async () => {
      const headers = await headersFor('adult');
      const author = await createAuthor({ name: 'Mismo Nombre' });
      const patch = (name: string) =>
        app.inject({ method: 'PATCH', url: `/authors/${author.id}`, headers, payload: { name } });

      const same = await patch('Mismo Nombre');
      const recased = await patch('MISMO NOMBRE');

      expect(same.statusCode).toBe(200);
      expect(recased.statusCode).toBe(200);
      expect(recased.json()).toEqual({ id: author.id, name: 'MISMO NOMBRE' });
    });

    it('de un id inexistente responde 404', async () => {
      const headers = await headersFor('adult');

      const res = await app.inject({
        method: 'PATCH',
        url: `/authors/${UNKNOWN_ID}`,
        headers,
        payload: { name: 'Da igual' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE', () => {
    it('de un autor sin libros responde 204 y después GET responde 404', async () => {
      const headers = await headersFor('adult');
      const author = await createAuthor();

      const del = await app.inject({ method: 'DELETE', url: `/authors/${author.id}`, headers });
      const get = await app.inject({ method: 'GET', url: `/authors/${author.id}`, headers });

      expect(del.statusCode).toBe(204);
      expect(get.statusCode).toBe(404);
    });

    it('de un id inexistente responde 404', async () => {
      const headers = await headersFor('adult');

      const res = await app.inject({ method: 'DELETE', url: `/authors/${UNKNOWN_ID}`, headers });

      expect(res.statusCode).toBe(404);
    });

    it('de un autor con libros responde 409 y el autor y su vínculo siguen ahí', async () => {
      const headers = await headersFor('adult');
      const author = await createAuthor();
      const book = await createBook({ authorIds: [author.id] });

      const res = await app.inject({ method: 'DELETE', url: `/authors/${author.id}`, headers });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({
        message: 'No se puede borrar: el autor tiene libros',
      });
      expect(await testDb.select().from(authors).where(eq(authors.id, author.id))).toHaveLength(1);
      expect(await testDb.select().from(bookAuthors)).toEqual([
        { bookId: book.id, authorId: author.id },
      ]);
    });
  });
});

describe('listado de /authors', () => {
  const list = async (query: string) => {
    const headers = await headersFor('guest');
    return app.inject({ method: 'GET', url: `/authors${query}`, headers });
  };
  const names = (res: Awaited<ReturnType<typeof list>>) =>
    res.json<{ authors: { name: string }[] }>().authors.map((a) => a.name);

  it('va ordenado por nombre e incluye el total', async () => {
    await createAuthor({ name: 'Cervantes' });
    await createAuthor({ name: 'Austen' });
    await createAuthor({ name: 'Borges' });

    const res = await list('');

    expect(res.statusCode).toBe(200);
    expect(names(res)).toEqual(['Austen', 'Borges', 'Cervantes']);
    expect(res.json()).toMatchObject({ total: 3 });
  });

  it('q filtra sin distinguir mayúsculas y total cuenta solo los coincidentes', async () => {
    await createAuthor({ name: 'Asimov, Isaac' });
    await createAuthor({ name: 'Newton, ISAAC' });
    await createAuthor({ name: 'Jane Austen' });

    const res = await list('?q=isaac');

    expect(names(res)).toEqual(['Asimov, Isaac', 'Newton, ISAAC']);
    expect(res.json()).toMatchObject({ total: 2 });
  });

  it.each(['%', '_'])('q=%s solo coincide con nombres que contienen ese carácter', async (q) => {
    await createAuthor({ name: '100% Real' });
    await createAuthor({ name: 'a_b' });
    await createAuthor({ name: 'Normal' });

    const res = await list(`?q=${encodeURIComponent(q)}`);

    expect(names(res)).toEqual([q === '%' ? '100% Real' : 'a_b']);
    expect(res.json()).toMatchObject({ total: 1 });
  });

  it('limit y offset paginan sin repetir ni saltar, con total constante', async () => {
    for (const name of ['E', 'D', 'C', 'B', 'A']) await createAuthor({ name });

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

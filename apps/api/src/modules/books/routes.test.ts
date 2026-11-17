import type { BookDetail, BookListResponse, Role } from '@jarvis/schemas';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  authors,
  bookAuthors,
  bookGenres,
  books,
  genres,
  loans,
  readings,
  sagas,
} from '../../db/schema/index.js';
import {
  buildTestApp,
  createAuthor,
  createBook,
  createGenre,
  createLoan,
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

describe('permisos de /books', () => {
  it('sin token las cinco rutas responden 401', async () => {
    const book = await createBook();
    const requests = [
      { method: 'GET', url: '/books' },
      { method: 'GET', url: `/books/${book.id}` },
      { method: 'POST', url: '/books', payload: { title: 'Nuevo' } },
      { method: 'PATCH', url: `/books/${book.id}`, payload: { title: 'Cambiado' } },
      { method: 'DELETE', url: `/books/${book.id}` },
    ] as const;

    for (const request of requests) {
      const response = await app.inject(request);
      expect(response.statusCode, `${request.method} ${request.url}`).toBe(401);
    }
  });

  it.each<Role>(['admin', 'adult', 'guest'])('%s puede leer el detalle', async (role) => {
    const headers = await headersFor(role);
    const book = await createBook();

    const response = await app.inject({ method: 'GET', url: `/books/${book.id}`, headers });

    expect(response.statusCode).toBe(200);
  });

  it.each<Role>(['admin', 'adult', 'guest'])('%s puede leer el listado', async (role) => {
    const headers = await headersFor(role);
    const book = await createBook();

    const response = await app.inject({ method: 'GET', url: '/books', headers });

    expect(response.statusCode).toBe(200);
    expect(response.json<BookListResponse>().books.map((b) => b.id)).toEqual([book.id]);
  });

  it('un invitado no puede crear, editar ni borrar, y no cambia nada', async () => {
    const headers = await headersFor('guest');
    const book = await createBook({ title: 'Original' });

    const post = await app.inject({
      method: 'POST',
      url: '/books',
      headers,
      payload: { title: 'Nuevo' },
    });
    const patch = await app.inject({
      method: 'PATCH',
      url: `/books/${book.id}`,
      headers,
      payload: { title: 'Cambiado' },
    });
    const del = await app.inject({ method: 'DELETE', url: `/books/${book.id}`, headers });

    expect([post.statusCode, patch.statusCode, del.statusCode]).toEqual([403, 403, 403]);
    const rows = await testDb.select({ id: books.id, title: books.title }).from(books);
    expect(rows).toEqual([{ id: book.id, title: 'Original' }]);
  });

  it.each<Role>(['admin', 'adult'])('%s puede crear, editar y borrar', async (role) => {
    const headers = await headersFor(role);

    const post = await app.inject({
      method: 'POST',
      url: '/books',
      headers,
      payload: { title: 'Nuevo' },
    });
    const id = post.json<{ id: string }>().id;
    const patch = await app.inject({
      method: 'PATCH',
      url: `/books/${id}`,
      headers,
      payload: { title: 'Cambiado' },
    });
    const del = await app.inject({ method: 'DELETE', url: `/books/${id}`, headers });

    expect([post.statusCode, patch.statusCode, del.statusCode]).toEqual([201, 200, 204]);
  });
});

describe('GET /books', () => {
  async function list(query: Record<string, string> = {}) {
    const headers = await headersFor('adult');
    return app.inject({ method: 'GET', url: '/books', query, headers });
  }

  // Títulos de los libros de la respuesta, en su orden.
  async function titles(query: Record<string, string>) {
    const response = await list(query);
    expect(response.statusCode).toBe(200);
    return response.json<BookListResponse>().books.map((book) => book.title);
  }

  it('sin libros devuelve una lista vacía', async () => {
    const response = await list();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ books: [], total: 0 });
  });

  // Dos libros con relaciones distintas: si el reparto en lote mezclara ids, uno llevaría
  // autores, géneros, saga o préstamo del otro.
  it('cada libro trae solo sus relaciones, igual que el detalle', async () => {
    const headers = await headersFor('adult');
    const [zeta, alfa, otro] = [
      await createAuthor({ name: 'Zeta' }),
      await createAuthor({ name: 'Alfa' }),
      await createAuthor({ name: 'Otro autor' }),
    ];
    const [terror, aventura, poesia] = [
      await createGenre({ name: 'Terror' }),
      await createGenre({ name: 'Aventura' }),
      await createGenre({ name: 'Poesía' }),
    ];
    const [fundacion, dune] = [
      await createSaga({ name: 'Fundación' }),
      await createSaga({ name: 'Dune' }),
    ];
    const full = await createBook({
      title: 'A completo',
      authorIds: [zeta.id, alfa.id],
      genreIds: [terror.id, aventura.id],
      sagaId: fundacion.id,
      sagaOrder: 1,
    });
    const other = await createBook({
      title: 'B otro',
      authorIds: [otro.id],
      genreIds: [poesia.id],
      sagaId: dune.id,
      sagaOrder: 1,
    });
    await createLoan({ bookId: full.id, borrower: 'Vecina' });
    await createLoan({ bookId: other.id, borrower: 'Primo' });
    const bare = await createBook({ title: 'C vacío' });

    const response = await list();
    const details = await Promise.all(
      [full, other, bare].map(async (book) =>
        (await app.inject({ method: 'GET', url: `/books/${book.id}`, headers })).json<BookDetail>(),
      ),
    );

    expect(response.json()).toEqual({ books: details, total: 3 });
    const [first, second, third] = response.json<BookListResponse>().books;
    expect(first!.authors.map((author) => author.name)).toEqual(['Alfa', 'Zeta']);
    expect(first!.genres.map((genre) => genre.name)).toEqual(['Aventura', 'Terror']);
    expect(first!.saga).toEqual({ id: fundacion.id, name: 'Fundación' });
    expect(first!.activeLoan).toMatchObject({ borrower: 'Vecina' });
    expect(second!.authors.map((author) => author.name)).toEqual(['Otro autor']);
    expect(second!.genres.map((genre) => genre.name)).toEqual(['Poesía']);
    expect(second!.saga).toEqual({ id: dune.id, name: 'Dune' });
    expect(second!.activeLoan).toMatchObject({ borrower: 'Primo' });
    expect(third).toMatchObject({ authors: [], genres: [], saga: null, activeLoan: null });
  });

  it('ordena por título', async () => {
    await createBook({ title: 'Cumbres' });
    await createBook({ title: 'Anillos' });
    await createBook({ title: 'Bosque' });

    expect(await titles({})).toEqual(['Anillos', 'Bosque', 'Cumbres']);
  });

  it('pagina con limit y offset sin solapar páginas, y total cuenta todos', async () => {
    for (const title of ['E', 'D', 'C', 'B', 'A']) await createBook({ title });

    const pages = await Promise.all(
      ['0', '2', '4'].map(async (offset) =>
        (await list({ limit: '2', offset })).json<BookListResponse>(),
      ),
    );

    expect(pages.map((page) => page.total)).toEqual([5, 5, 5]);
    expect(pages.map((page) => page.books.map((book) => book.title))).toEqual([
      ['A', 'B'],
      ['C', 'D'],
      ['E'],
    ]);
  });

  it.each<Record<string, string>>([{ limit: '0' }, { limit: '201' }, { offset: '-1' }])(
    'con paginación fuera de rango (%o) da 400',
    async (query) => {
      expect((await list(query)).statusCode).toBe(400);
    },
  );

  it('q busca en el título sin distinguir mayúsculas y en el nombre de los autores', async () => {
    const tolkien = await createAuthor({ name: 'J. R. R. Tolkien' });
    await createBook({ title: 'El Hobbit' });
    await createBook({ title: 'El Silmarillion', authorIds: [tolkien.id] });
    await createBook({ title: 'Dune' });

    expect(await titles({ q: 'hobbit' })).toEqual(['El Hobbit']);
    expect(await titles({ q: 'tolkien' })).toEqual(['El Silmarillion']);
  });

  it('un libro que coincide varias veces con q sale una sola vez', async () => {
    const first = await createAuthor({ name: 'Ana Fantasía' });
    const second = await createAuthor({ name: 'Luis Fantasía' });
    await createBook({ title: 'Fantasía total', authorIds: [first.id, second.id] });

    const response = await list({ q: 'fantasía' });

    expect(response.json<BookListResponse>().books).toHaveLength(1);
    expect(response.json<BookListResponse>().total).toBe(1);
  });

  it('q vacío da 400', async () => {
    expect((await list({ q: '' })).statusCode).toBe(400);
  });

  it('authorId, genreId y sagaId devuelven solo los libros con esa relación', async () => {
    const author = await createAuthor();
    const genre = await createGenre();
    const saga = await createSaga();
    await createBook({ title: 'Con autor', authorIds: [author.id] });
    await createBook({ title: 'Con género', genreIds: [genre.id] });
    await createBook({ title: 'Con saga', sagaId: saga.id });
    await createBook({ title: 'Sin nada' });

    expect(await titles({ authorId: author.id })).toEqual(['Con autor']);
    expect(await titles({ genreId: genre.id })).toEqual(['Con género']);
    expect(await titles({ sagaId: saga.id })).toEqual(['Con saga']);
  });

  it('un filtro con id inexistente da lista vacía y uno mal formado, 400', async () => {
    await createBook();

    for (const filter of ['authorId', 'genreId', 'sagaId']) {
      const unknown = await list({ [filter]: UNKNOWN_ID });
      expect(unknown.statusCode, filter).toBe(200);
      expect(unknown.json(), filter).toEqual({ books: [], total: 0 });
      expect((await list({ [filter]: 'no-es-un-uuid' })).statusCode, filter).toBe(400);
    }
  });

  it('loaned filtra por préstamo sin devolver; uno devuelto cuenta como no prestado', async () => {
    const loaned = await createBook({ title: 'Prestado' });
    const returned = await createBook({ title: 'Devuelto' });
    await createBook({ title: 'En casa' });
    await createLoan({ bookId: loaned.id });
    await createLoan({ bookId: returned.id, returnedAt: '2026-02-01' });

    expect(await titles({ loaned: 'true' })).toEqual(['Prestado']);
    expect(await titles({ loaned: 'false' })).toEqual(['Devuelto', 'En casa']);
  });

  it('loaned con un valor que no es true ni false da 400', async () => {
    expect((await list({ loaned: 'yes' })).statusCode).toBe(400);
    expect((await list({ loaned: 'TRUE' })).statusCode).toBe(400);
  });

  it('los filtros se combinan con AND', async () => {
    const genre = await createGenre();
    const match = await createBook({ title: 'Viaje A', genreIds: [genre.id] });
    await createBook({ title: 'Viaje B', genreIds: [genre.id] }); // sin préstamo
    const otherGenre = await createBook({ title: 'Viaje C' });
    const otherTitle = await createBook({ title: 'Otro', genreIds: [genre.id] });
    for (const book of [match, otherGenre, otherTitle]) await createLoan({ bookId: book.id });

    const response = await list({ q: 'viaje', genreId: genre.id, loaned: 'true' });

    expect(response.json<BookListResponse>().books.map((book) => book.id)).toEqual([match.id]);
    expect(response.json<BookListResponse>().total).toBe(1);
  });
});

describe('GET /books/:id', () => {
  it('devuelve autores y géneros por nombre, la saga y el orden', async () => {
    const headers = await headersFor('adult');
    const [zeta, alfa] = [
      await createAuthor({ name: 'Zeta' }),
      await createAuthor({ name: 'Alfa' }),
    ];
    const [terror, aventura] = [
      await createGenre({ name: 'Terror' }),
      await createGenre({ name: 'Aventura' }),
    ];
    const saga = await createSaga({ name: 'Fundación' });
    const book = await createBook({
      title: 'Segunda Fundación',
      authorIds: [zeta.id, alfa.id],
      genreIds: [terror.id, aventura.id],
      sagaId: saga.id,
      sagaOrder: 2.5,
    });

    const response = await app.inject({ method: 'GET', url: `/books/${book.id}`, headers });

    expect(response.json()).toEqual({
      id: book.id,
      title: 'Segunda Fundación',
      sagaId: saga.id,
      sagaOrder: 2.5,
      isbn: null,
      year: null,
      language: null,
      location: null,
      notes: null,
      authors: [
        { id: alfa.id, name: 'Alfa' },
        { id: zeta.id, name: 'Zeta' },
      ],
      genres: [
        { id: aventura.id, name: 'Aventura' },
        { id: terror.id, name: 'Terror' },
      ],
      saga: { id: saga.id, name: 'Fundación' },
      activeLoan: null,
    });
  });

  it('un libro sin relaciones devuelve listas vacías y nulos', async () => {
    const headers = await headersFor('adult');
    const book = await createBook();

    const response = await app.inject({ method: 'GET', url: `/books/${book.id}`, headers });

    expect(response.json()).toMatchObject({
      authors: [],
      genres: [],
      saga: null,
      activeLoan: null,
    });
  });

  it('con un préstamo sin devolver devuelve activeLoan; con el préstamo devuelto, null', async () => {
    const headers = await headersFor('adult');
    const lent = await createBook();
    const returned = await createBook();
    const loan = await createLoan({ bookId: lent.id, borrower: 'Marta', loanedAt: '2026-03-01' });
    await createLoan({ bookId: returned.id, loanedAt: '2026-03-01', returnedAt: '2026-03-10' });

    const lentResponse = await app.inject({ method: 'GET', url: `/books/${lent.id}`, headers });
    const returnedResponse = await app.inject({
      method: 'GET',
      url: `/books/${returned.id}`,
      headers,
    });

    expect(lentResponse.json()).toMatchObject({
      activeLoan: {
        id: loan.id,
        bookId: lent.id,
        borrower: 'Marta',
        loanedAt: '2026-03-01',
        returnedAt: null,
      },
    });
    expect(returnedResponse.json()).toMatchObject({ activeLoan: null });
  });

  it('un id inexistente da 404 y uno mal formado, 400', async () => {
    const headers = await headersFor('adult');

    const unknown = await app.inject({ method: 'GET', url: `/books/${UNKNOWN_ID}`, headers });
    const malformed = await app.inject({ method: 'GET', url: '/books/no-es-un-uuid', headers });

    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ message: 'Libro no encontrado' });
    expect(malformed.statusCode).toBe(400);
  });
});

// Cuerpos que se repiten en varios tests de escritura.
const post = (headers: Record<string, string>, payload: unknown) =>
  app.inject({ method: 'POST', url: '/books', headers, payload: payload as object });

const patch = (headers: Record<string, string>, id: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url: `/books/${id}`, headers, payload: payload as object });

const countBooks = async () => (await testDb.select({ id: books.id }).from(books)).length;

describe('POST /books', () => {
  it('con solo el título devuelve el detalle vacío', async () => {
    const headers = await headersFor('adult');

    const response = await post(headers, { title: '  Dune  ' });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: response.json<BookDetail>().id,
      title: 'Dune',
      sagaId: null,
      sagaOrder: null,
      isbn: null,
      year: null,
      language: null,
      location: null,
      notes: null,
      authors: [],
      genres: [],
      saga: null,
      activeLoan: null,
    });
  });

  it('con todos los campos, el GET posterior lo devuelve igual', async () => {
    const headers = await headersFor('adult');
    const author = await createAuthor({ name: 'Herbert' });
    const genre = await createGenre({ name: 'Ciencia ficción' });
    const saga = await createSaga({ name: 'Dune' });

    const created = await post(headers, {
      title: 'Dune',
      authorIds: [author.id],
      genreIds: [genre.id],
      sagaId: saga.id,
      sagaOrder: 1,
      isbn: '978-84-450-7340-5',
      year: 1965,
      language: 'es',
      location: 'Salón, estante 2',
      notes: 'Edición de bolsillo',
    });
    const fetched = await app.inject({
      method: 'GET',
      url: `/books/${created.json<{ id: string }>().id}`,
      headers,
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      authors: [{ id: author.id, name: 'Herbert' }],
      genres: [{ id: genre.id, name: 'Ciencia ficción' }],
      saga: { id: saga.id, name: 'Dune' },
      sagaOrder: 1,
      year: 1965,
    });
    expect(fetched.json()).toEqual(created.json());
  });

  it('con el título vacío o ausente da 400', async () => {
    const headers = await headersFor('adult');

    const empty = await post(headers, { title: '   ' });
    const missing = await post(headers, {});

    expect([empty.statusCode, missing.statusCode]).toEqual([400, 400]);
    expect(await countBooks()).toBe(0);
  });

  it.each([
    ['author', 'authorIds', 'Autor inexistente'],
    ['genre', 'genreIds', 'Género inexistente'],
  ])('con un %s inexistente da 400 y no queda ningún libro', async (_, field, message) => {
    const headers = await headersFor('adult');

    const response = await post(headers, { title: 'Dune', [field]: [UNKNOWN_ID] });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message });
    expect(await countBooks()).toBe(0);
  });

  it('con una saga inexistente da 400 y no queda ningún libro', async () => {
    const headers = await headersFor('adult');

    const response = await post(headers, { title: 'Dune', sagaId: UNKNOWN_ID });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: 'Saga inexistente' });
    expect(await countBooks()).toBe(0);
  });

  it('con un autor válido y otro inexistente, la transacción deshace todo', async () => {
    const headers = await headersFor('adult');
    const author = await createAuthor();

    const response = await post(headers, { title: 'Dune', authorIds: [author.id, UNKNOWN_ID] });

    expect(response.statusCode).toBe(400);
    expect(await countBooks()).toBe(0);
    expect(await testDb.select().from(bookAuthors)).toEqual([]);
  });

  it('deduplica los ids repetidos de autores y géneros', async () => {
    const headers = await headersFor('adult');
    const author = await createAuthor();
    const genre = await createGenre();

    const response = await post(headers, {
      title: 'Dune',
      authorIds: [author.id, author.id, author.id.toUpperCase()],
      genreIds: [genre.id, genre.id],
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<BookDetail>().authors).toHaveLength(1);
    expect(response.json<BookDetail>().genres).toHaveLength(1);
  });

  it('con 21 autores da 400', async () => {
    const headers = await headersFor('adult');
    const authorIds = Array.from({ length: 21 }, () => UNKNOWN_ID);

    const response = await post(headers, { title: 'Dune', authorIds });

    expect(response.statusCode).toBe(400);
  });

  it('valida sagaOrder: necesita saga, un decimal y no negativo', async () => {
    const headers = await headersFor('adult');
    const saga = await createSaga();

    const withoutSaga = await post(headers, { title: 'A', sagaOrder: 1 });
    const decimal = await post(headers, { title: 'B', sagaId: saga.id, sagaOrder: 2.5 });
    const twoDecimals = await post(headers, { title: 'C', sagaId: saga.id, sagaOrder: 2.55 });
    const negative = await post(headers, { title: 'D', sagaId: saga.id, sagaOrder: -1 });

    expect(withoutSaga.statusCode).toBe(400);
    expect(decimal.statusCode).toBe(201);
    expect(decimal.json()).toMatchObject({ sagaOrder: 2.5 });
    expect(twoDecimals.statusCode).toBe(400);
    expect(negative.statusCode).toBe(400);
  });

  it('normaliza el ISBN, rechaza uno malformado y admite uno repetido', async () => {
    const headers = await headersFor('adult');

    const first = await post(headers, { title: 'A', isbn: '978-84-450-7340-5' });
    const lower = await post(headers, { title: 'B', isbn: '84-376-0494-x' });
    const bad = await post(headers, { title: 'C', isbn: '123' });
    const repeated = await post(headers, { title: 'D', isbn: '9788445073405' });

    expect(first.json()).toMatchObject({ isbn: '9788445073405' });
    expect(lower.json()).toMatchObject({ isbn: '843760494X' });
    expect(bad.statusCode).toBe(400);
    expect(repeated.statusCode).toBe(201);
  });

  it('guarda el idioma en minúsculas', async () => {
    const headers = await headersFor('adult');

    const response = await post(headers, { title: 'A', language: 'ES' });

    expect(response.json()).toMatchObject({ language: 'es' });
  });
});

describe('PATCH /books/:id', () => {
  it('solo con title cambia el título y conserva autores, géneros y saga', async () => {
    const headers = await headersFor('adult');
    const author = await createAuthor();
    const genre = await createGenre();
    const saga = await createSaga();
    const book = await createBook({
      title: 'Viejo',
      authorIds: [author.id],
      genreIds: [genre.id],
      sagaId: saga.id,
      sagaOrder: 3,
    });

    const response = await patch(headers, book.id, { title: 'Nuevo' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      title: 'Nuevo',
      authors: [{ id: author.id }],
      genres: [{ id: genre.id }],
      saga: { id: saga.id },
      sagaOrder: 3,
    });
  });

  it('authorIds sustituye el conjunto, [] quita todos y ausente no los toca', async () => {
    const headers = await headersFor('adult');
    const [a, b] = [await createAuthor(), await createAuthor()];
    const book = await createBook({ authorIds: [a.id] });

    const replaced = await patch(headers, book.id, { authorIds: [b.id] });
    const untouched = await patch(headers, book.id, { title: 'Otro' });
    const cleared = await patch(headers, book.id, { authorIds: [] });

    expect(replaced.json<BookDetail>().authors).toEqual([{ id: b.id, name: b.name }]);
    expect(untouched.json<BookDetail>().authors).toEqual([{ id: b.id, name: b.name }]);
    expect(cleared.json<BookDetail>().authors).toEqual([]);
  });

  it('isbn null lo borra; {} y title null dan 400', async () => {
    const headers = await headersFor('adult');
    const book = await createBook();
    await patch(headers, book.id, { isbn: '9788445073405' });

    const cleared = await patch(headers, book.id, { isbn: null });
    const empty = await patch(headers, book.id, {});
    const nullTitle = await patch(headers, book.id, { title: null });

    expect(cleared.json()).toMatchObject({ isbn: null });
    expect(empty.statusCode).toBe(400);
    expect(nullTitle.statusCode).toBe(400);
  });

  it('solo con relaciones actualiza updatedAt', async () => {
    const headers = await headersFor('adult');
    const author = await createAuthor();
    const book = await createBook();

    await patch(headers, book.id, { authorIds: [author.id] });

    const [row] = await testDb.select({ updatedAt: books.updatedAt }).from(books);
    expect(row!.updatedAt.getTime()).toBeGreaterThan(book.updatedAt.getTime());
  });

  it('sagaId null quita la saga y el orden; con sagaOrder no nulo da 400', async () => {
    const headers = await headersFor('adult');
    const saga = await createSaga();
    const book = await createBook({ sagaId: saga.id, sagaOrder: 2 });

    const conflict = await patch(headers, book.id, { sagaId: null, sagaOrder: 1 });
    const removed = await patch(headers, book.id, { sagaId: null });

    expect(conflict.statusCode).toBe(400);
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({ sagaId: null, sagaOrder: null, saga: null });
  });

  it('sagaOrder sobre un libro sin saga da 400', async () => {
    const headers = await headersFor('adult');
    const book = await createBook();

    const response = await patch(headers, book.id, { sagaOrder: 1 });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: 'El orden en la saga necesita una saga' });
  });

  it('con un género inexistente da 400 y el libro conserva los anteriores', async () => {
    const headers = await headersFor('adult');
    const genre = await createGenre();
    const book = await createBook({ title: 'Viejo', genreIds: [genre.id] });

    const response = await patch(headers, book.id, {
      title: 'Nuevo',
      genreIds: [UNKNOWN_ID],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: 'Género inexistente' });
    const after = await app.inject({ method: 'GET', url: `/books/${book.id}`, headers });
    expect(after.json()).toMatchObject({ title: 'Viejo', genres: [{ id: genre.id }] });
  });

  it.each([
    ['authorIds', [UNKNOWN_ID], 'Autor inexistente'],
    ['sagaId', UNKNOWN_ID, 'Saga inexistente'],
  ])('con %s inexistente da 400 y el libro no cambia', async (field, value, message) => {
    const headers = await headersFor('adult');
    const author = await createAuthor();
    const saga = await createSaga();
    const book = await createBook({
      title: 'Viejo',
      authorIds: [author.id],
      sagaId: saga.id,
      sagaOrder: 1,
    });

    const response = await patch(headers, book.id, { title: 'Nuevo', [field]: value });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message });
    const after = await app.inject({ method: 'GET', url: `/books/${book.id}`, headers });
    expect(after.json()).toMatchObject({
      title: 'Viejo',
      authors: [{ id: author.id }],
      sagaId: saga.id,
      sagaOrder: 1,
    });
  });

  it('con un id inexistente da 404', async () => {
    const headers = await headersFor('adult');

    const response = await patch(headers, UNKNOWN_ID, { title: 'Nuevo' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ message: 'Libro no encontrado' });
  });
});

describe('DELETE /books/:id', () => {
  it('borra el libro y sus relaciones, pero no autores, géneros ni saga', async () => {
    const headers = await headersFor('adult');
    const author = await createAuthor();
    const genre = await createGenre();
    const saga = await createSaga();
    const book = await createBook({
      authorIds: [author.id],
      genreIds: [genre.id],
      sagaId: saga.id,
    });
    await createLoan({ bookId: book.id });
    const reader = await createUser();
    await testDb.insert(readings).values({
      bookId: book.id,
      userId: reader.id,
      finishedAt: '2026-02-01',
    });

    const response = await app.inject({ method: 'DELETE', url: `/books/${book.id}`, headers });

    expect(response.statusCode).toBe(204);
    expect(await testDb.select().from(books)).toEqual([]);
    expect(await testDb.select().from(bookAuthors)).toEqual([]);
    expect(await testDb.select().from(bookGenres)).toEqual([]);
    expect(await testDb.select().from(loans)).toEqual([]);
    expect(await testDb.select().from(readings)).toEqual([]);
    expect(await testDb.select().from(authors)).toHaveLength(1);
    expect(await testDb.select().from(genres)).toHaveLength(1);
    expect(await testDb.select().from(sagas)).toHaveLength(1);
  });

  it('con un id inexistente da 404', async () => {
    const headers = await headersFor('adult');

    const response = await app.inject({ method: 'DELETE', url: `/books/${UNKNOWN_ID}`, headers });

    expect(response.statusCode).toBe(404);
  });
});

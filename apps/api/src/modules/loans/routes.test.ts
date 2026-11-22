import type {
  ActiveLoansResponse,
  BookDetail,
  BookLoansResponse,
  Loan,
  Role,
} from '@jarvis/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loans } from '../../db/schema/index.js';
import {
  buildTestApp,
  createAuthor,
  createBook,
  createLoan,
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

function lend(
  bookId: string,
  headers: Record<string, string>,
  payload: object = { borrower: 'Vecina', loanedAt: '2026-03-01' },
) {
  return app.inject({ method: 'POST', url: `/books/${bookId}/loans`, headers, payload });
}

function giveBack(loanId: string, headers: Record<string, string>, returnedAt = '2026-03-10') {
  return app.inject({
    method: 'POST',
    url: `/loans/${loanId}/return`,
    headers,
    payload: { returnedAt },
  });
}

describe('permisos de préstamos', () => {
  it('sin token las cuatro rutas responden 401', async () => {
    const book = await createBook();
    const loan = await createLoan({ bookId: book.id });
    const requests = [
      {
        method: 'POST',
        url: `/books/${book.id}/loans`,
        payload: { borrower: 'Vecina', loanedAt: '2026-03-01' },
      },
      { method: 'POST', url: `/loans/${loan.id}/return`, payload: { returnedAt: '2026-03-10' } },
      { method: 'GET', url: `/books/${book.id}/loans` },
      { method: 'GET', url: '/loans/active' },
    ] as const;

    for (const request of requests) {
      const response = await app.inject(request);
      expect(response.statusCode, `${request.method} ${request.url}`).toBe(401);
    }
  });

  it('un invitado no puede prestar y no se crea el préstamo', async () => {
    const headers = await headersFor('guest');
    const book = await createBook();

    const response = await lend(book.id, headers);

    expect(response.statusCode).toBe(403);
    expect(await testDb.select().from(loans)).toEqual([]);
  });

  it('un invitado no puede devolver y el préstamo sigue activo', async () => {
    const headers = await headersFor('guest');
    const book = await createBook();
    const loan = await createLoan({ bookId: book.id });

    const response = await giveBack(loan.id, headers);

    expect(response.statusCode).toBe(403);
    const [row] = await testDb.select().from(loans).where(eq(loans.id, loan.id));
    expect(row!.returnedAt).toBeNull();
  });

  it('un invitado puede ver el historial y los préstamos activos', async () => {
    const headers = await headersFor('guest');
    const book = await createBook();

    const history = await app.inject({ method: 'GET', url: `/books/${book.id}/loans`, headers });
    const active = await app.inject({ method: 'GET', url: '/loans/active', headers });

    expect(history.statusCode).toBe(200);
    expect(active.statusCode).toBe(200);
  });

  it.each<Role>(['admin', 'adult'])('%s puede prestar', async (role) => {
    const headers = await headersFor(role);
    const book = await createBook();

    const response = await lend(book.id, headers);

    expect(response.statusCode).toBe(201);
  });

  it('prestar un libro ya prestado da 409', async () => {
    const headers = await headersFor('adult');
    const book = await createBook();
    await createLoan({ bookId: book.id });

    const response = await lend(book.id, headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ message: 'El libro ya está prestado' });
  });
});

describe('POST /books/:id/loans', () => {
  it('crea el préstamo activo y el detalle del libro lo muestra', async () => {
    const headers = await headersFor('adult');
    const book = await createBook();

    const response = await lend(book.id, headers, {
      borrower: '  Marta  ',
      loanedAt: '2026-03-01',
    });

    expect(response.statusCode).toBe(201);
    const loan = response.json<Loan>();
    expect(loan).toEqual({
      id: loan.id,
      bookId: book.id,
      borrower: 'Marta',
      loanedAt: '2026-03-01',
      returnedAt: null,
    });
    const detail = await app.inject({ method: 'GET', url: `/books/${book.id}`, headers });
    expect(detail.json<BookDetail>().activeLoan).toEqual(loan);
  });

  it('con un libro inexistente da 404', async () => {
    const headers = await headersFor('adult');

    const response = await lend(UNKNOWN_ID, headers);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ message: 'Libro no encontrado' });
  });

  it.each([
    ['borrower vacío', { borrower: '', loanedAt: '2026-03-01' }],
    ['borrower solo con espacios', { borrower: '   ', loanedAt: '2026-03-01' }],
    ['sin loanedAt', { borrower: 'Marta' }],
    ['loanedAt inválido', { borrower: 'Marta', loanedAt: '2026-02-30' }],
    ['loanedAt con hora', { borrower: 'Marta', loanedAt: '2026-03-01T10:00:00Z' }],
  ])('%s da 400', async (_case, payload) => {
    const headers = await headersFor('adult');
    const book = await createBook();

    const response = await lend(book.id, headers, payload);

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /loans/:id/return', () => {
  it('devuelve el préstamo, el libro queda en casa y se puede volver a prestar', async () => {
    const headers = await headersFor('adult');
    const book = await createBook();
    const loan = await createLoan({ bookId: book.id, loanedAt: '2026-03-01' });

    const response = await giveBack(loan.id, headers, '2026-03-10');

    expect(response.statusCode).toBe(200);
    expect(response.json<Loan>()).toMatchObject({ id: loan.id, returnedAt: '2026-03-10' });
    const detail = await app.inject({ method: 'GET', url: `/books/${book.id}`, headers });
    expect(detail.json<BookDetail>().activeLoan).toBeNull();
    expect((await lend(book.id, headers)).statusCode).toBe(201);
  });

  it('devolverlo el mismo día del préstamo vale', async () => {
    const headers = await headersFor('adult');
    const book = await createBook();
    const loan = await createLoan({ bookId: book.id, loanedAt: '2026-03-01' });

    const response = await giveBack(loan.id, headers, '2026-03-01');

    expect(response.statusCode).toBe(200);
  });

  it('devolverlo dos veces da 409', async () => {
    const headers = await headersFor('adult');
    const book = await createBook();
    const loan = await createLoan({ bookId: book.id });

    expect((await giveBack(loan.id, headers)).statusCode).toBe(200);
    const response = await giveBack(loan.id, headers, '2026-04-01');

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ message: 'El préstamo ya está devuelto' });
  });

  it('con un préstamo inexistente da 404', async () => {
    const headers = await headersFor('adult');

    const response = await giveBack(UNKNOWN_ID, headers);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ message: 'Préstamo no encontrado' });
  });

  it('con una devolución anterior al préstamo da 400', async () => {
    const headers = await headersFor('adult');
    const book = await createBook();
    const loan = await createLoan({ bookId: book.id, loanedAt: '2026-03-01' });

    const response = await giveBack(loan.id, headers, '2026-02-28');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      message: 'La devolución no puede ser anterior al préstamo',
    });
  });

  it.each([
    ['sin returnedAt', null, {}],
    ['returnedAt inválido', null, { returnedAt: '2026-02-30' }],
    ['returnedAt con hora', null, { returnedAt: '2026-03-10T10:00:00Z' }],
    ['id no uuid', 'no-es-uuid', { returnedAt: '2026-03-10' }],
  ])('%s da 400', async (_case, id, payload) => {
    const headers = await headersFor('adult');
    const book = await createBook();
    const loan = await createLoan({ bookId: book.id, loanedAt: '2026-03-01' });

    const response = await app.inject({
      method: 'POST',
      url: `/loans/${id ?? loan.id}/return`,
      headers,
      payload,
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('GET /books/:id/loans', () => {
  it('devuelve solo los préstamos del libro, del más reciente al más antiguo', async () => {
    const headers = await headersFor('guest');
    const book = await createBook();
    const other = await createBook();
    const oldest = await createLoan({
      bookId: book.id,
      loanedAt: '2026-01-01',
      returnedAt: '2026-01-05',
    });
    const sameDayFirst = await createLoan({
      bookId: book.id,
      loanedAt: '2026-02-01',
      returnedAt: '2026-02-01',
    });
    const sameDaySecond = await createLoan({ bookId: book.id, loanedAt: '2026-02-01' });
    await createLoan({ bookId: other.id });

    const response = await app.inject({ method: 'GET', url: `/books/${book.id}/loans`, headers });

    expect(response.statusCode).toBe(200);
    expect(response.json<BookLoansResponse>().loans.map((loan) => loan.id)).toEqual([
      sameDaySecond.id,
      sameDayFirst.id,
      oldest.id,
    ]);
  });

  it('un libro sin préstamos da una lista vacía', async () => {
    const headers = await headersFor('guest');
    const book = await createBook();

    const response = await app.inject({ method: 'GET', url: `/books/${book.id}/loans`, headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ loans: [] });
  });

  it('con un libro inexistente da 404', async () => {
    const headers = await headersFor('guest');

    const response = await app.inject({
      method: 'GET',
      url: `/books/${UNKNOWN_ID}/loans`,
      headers,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ message: 'Libro no encontrado' });
  });

  it('con un id que no es uuid da 400', async () => {
    const headers = await headersFor('guest');

    const response = await app.inject({ method: 'GET', url: '/books/no-es-uuid/loans', headers });

    expect(response.statusCode).toBe(400);
  });
});

describe('GET /loans/active', () => {
  it('lista solo los no devueltos, del más antiguo al más reciente, con su libro', async () => {
    const headers = await headersFor('guest');
    const author = await createAuthor({ name: 'Ursula K. Le Guin' });
    const recentBook = await createBook({ title: 'Reciente' });
    const oldBook = await createBook({ title: 'Antiguo', authorIds: [author.id] });
    const returnedBook = await createBook({ title: 'Devuelto' });
    const recent = await createLoan({ bookId: recentBook.id, loanedAt: '2026-03-01' });
    const old = await createLoan({ bookId: oldBook.id, loanedAt: '2026-01-01' });
    await createLoan({ bookId: returnedBook.id, loanedAt: '2025-12-01', returnedAt: '2026-01-01' });

    const response = await app.inject({ method: 'GET', url: '/loans/active', headers });

    expect(response.statusCode).toBe(200);
    const { loans: active } = response.json<ActiveLoansResponse>();
    expect(active.map((loan) => loan.id)).toEqual([old.id, recent.id]);
    expect(active[0]).toMatchObject({
      borrower: old.borrower,
      returnedAt: null,
      book: {
        id: oldBook.id,
        title: 'Antiguo',
        authors: [{ id: author.id, name: 'Ursula K. Le Guin' }],
        activeLoan: { id: old.id },
      },
    });
    expect(active[1]!.book).toMatchObject({ title: 'Reciente', authors: [] });
  });
});

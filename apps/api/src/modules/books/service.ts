import type {
  Book,
  BookDetail,
  BookListQuery,
  BookListResponse,
  CreateBookRequest,
  UpdateBookRequest,
} from '@jarvis/schemas';
import { and, count, eq, exists, ilike, inArray, isNull, notExists, or } from 'drizzle-orm';

import type { DbOrTx } from '../../db/client.js';
import { constraintOf, isCheckViolation, isForeignKeyViolation } from '../../db/errors.js';
import {
  authors,
  bookAuthors,
  bookGenres,
  books,
  genres,
  loans,
  sagas,
} from '../../db/schema/index.js';
import { containsPattern } from '../../db/search.js';

export type InvalidReferenceEntity = 'author' | 'genre' | 'saga';

export type CreateBookResult =
  | { status: 'ok'; book: BookDetail }
  | { status: 'invalid_reference'; entity: InvalidReferenceEntity };

export type UpdateBookResult =
  | { status: 'ok'; book: BookDetail }
  | { status: 'not_found' }
  | { status: 'invalid_reference'; entity: InvalidReferenceEntity }
  | { status: 'saga_order_without_saga' };

export type DeleteBookResult = { status: 'ok' } | { status: 'not_found' };

// Lo comparten el detalle, el listado, el detalle de saga (`modules/sagas/service.ts`) y los
// préstamos activos (`modules/loans/service.ts`).
export const bookColumns = {
  id: books.id,
  title: books.title,
  sagaId: books.sagaId,
  sagaOrder: books.sagaOrder,
  isbn: books.isbn,
  year: books.year,
  language: books.language,
  location: books.location,
  notes: books.notes,
};

// También lo usa `modules/loans/service.ts`.
export const loanColumns = {
  id: loans.id,
  bookId: loans.bookId,
  borrower: loans.borrower,
  loanedAt: loans.loanedAt,
  returnedAt: loans.returnedAt,
};

function groupByBook<T extends { bookId: string }>(rows: T[]) {
  const groups = new Map<string, Omit<T, 'bookId'>[]>();
  for (const { bookId, ...rest } of rows) {
    const group = groups.get(bookId);
    if (group) group.push(rest);
    else groups.set(bookId, [rest]);
  }
  return groups;
}

// Evita el N+1: en vez de cuatro consultas por libro, una por relación para todos los libros
// (`WHERE book_id IN (...)`), repartidas después en memoria. Sin `JOIN` gigante: autores y
// géneros multiplicarían las filas. Autores y géneros salen por nombre (y `id` desempata
// nombres que solo difieren en mayúsculas). Conserva el orden de `bookRows`.
export async function withRelations(db: DbOrTx, bookRows: Book[]): Promise<BookDetail[]> {
  if (bookRows.length === 0) return [];
  const ids = bookRows.map((book) => book.id);
  const sagaIds = [...new Set(bookRows.flatMap((book) => (book.sagaId ? [book.sagaId] : [])))];

  const [authorRows, genreRows, sagaRows, loanRows] = await Promise.all([
    db
      .select({ bookId: bookAuthors.bookId, id: authors.id, name: authors.name })
      .from(bookAuthors)
      .innerJoin(authors, eq(authors.id, bookAuthors.authorId))
      .where(inArray(bookAuthors.bookId, ids))
      .orderBy(authors.name, authors.id),
    db
      .select({ bookId: bookGenres.bookId, id: genres.id, name: genres.name })
      .from(bookGenres)
      .innerJoin(genres, eq(genres.id, bookGenres.genreId))
      .where(inArray(bookGenres.bookId, ids))
      .orderBy(genres.name, genres.id),
    sagaIds.length === 0
      ? Promise.resolve([])
      : db.select({ id: sagas.id, name: sagas.name }).from(sagas).where(inArray(sagas.id, sagaIds)),
    // El índice único parcial garantiza como mucho un préstamo sin devolver por libro.
    db
      .select(loanColumns)
      .from(loans)
      .where(and(inArray(loans.bookId, ids), isNull(loans.returnedAt))),
  ]);

  const authorsByBook = groupByBook(authorRows);
  const genresByBook = groupByBook(genreRows);
  const sagasById = new Map(sagaRows.map((saga) => [saga.id, saga]));
  const loansByBook = new Map(loanRows.map((loan) => [loan.bookId, loan]));

  return bookRows.map((book) => ({
    ...book,
    authors: authorsByBook.get(book.id) ?? [],
    genres: genresByBook.get(book.id) ?? [],
    saga: book.sagaId === null ? null : (sagasById.get(book.sagaId) ?? null),
    activeLoan: loansByBook.get(book.id) ?? null,
  }));
}

export async function getBook(db: DbOrTx, id: string): Promise<BookDetail | undefined> {
  const [book] = await db.select(bookColumns).from(books).where(eq(books.id, id));
  if (!book) return undefined;
  const [detail] = await withRelations(db, [book]);
  return detail;
}

// `q` busca en el título y en el nombre de cualquiera de los autores.
function matchesQuery(db: DbOrTx, q: string) {
  const pattern = containsPattern(q);
  return or(
    ilike(books.title, pattern),
    exists(
      db
        .select({ id: authors.id })
        .from(bookAuthors)
        .innerJoin(authors, eq(authors.id, bookAuthors.authorId))
        .where(and(eq(bookAuthors.bookId, books.id), ilike(authors.name, pattern))),
    ),
  );
}

// Los filtros sobre tablas relacionadas van con `EXISTS` y no con `JOIN`: un libro con dos
// autores que coinciden con `q` saldría dos veces y `total` contaría de más.
function listWhere(db: DbOrTx, { q, authorId, genreId, sagaId, loaned }: BookListQuery) {
  const activeLoan = db
    .select({ id: loans.id })
    .from(loans)
    .where(and(eq(loans.bookId, books.id), isNull(loans.returnedAt)));

  return and(
    q === undefined ? undefined : matchesQuery(db, q),
    authorId === undefined
      ? undefined
      : exists(
          db
            .select({ id: bookAuthors.authorId })
            .from(bookAuthors)
            .where(and(eq(bookAuthors.bookId, books.id), eq(bookAuthors.authorId, authorId))),
        ),
    genreId === undefined
      ? undefined
      : exists(
          db
            .select({ id: bookGenres.genreId })
            .from(bookGenres)
            .where(and(eq(bookGenres.bookId, books.id), eq(bookGenres.genreId, genreId))),
        ),
    sagaId === undefined ? undefined : eq(books.sagaId, sagaId),
    loaned === undefined ? undefined : loaned ? exists(activeLoan) : notExists(activeLoan),
  );
}

export async function listBooks(db: DbOrTx, query: BookListQuery): Promise<BookListResponse> {
  const where = listWhere(db, query);
  const [rows, [totalRow]] = await Promise.all([
    db
      .select(bookColumns)
      .from(books)
      .where(where)
      // `id` desempata títulos iguales: sin él las páginas podrían solaparse.
      .orderBy(books.title, books.id)
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(books).where(where),
  ]);
  return { books: await withRelations(db, rows), total: totalRow!.total };
}

// Qué referencia del cuerpo no existe, según la clave foránea que saltó.
const referenceConstraints: Record<string, InvalidReferenceEntity> = {
  book_authors_author_id_authors_id_fk: 'author',
  book_genres_genre_id_genres_id_fk: 'genre',
  books_saga_id_sagas_id_fk: 'saga',
};

// `new Set` deduplica (la PK compuesta lanzaría `23505` y saldría un 500). Los uuid se
// pasan a minúsculas porque `z.uuid()` acepta mayúsculas y Postgres las trata como iguales.
const uniqueIds = (ids: string[]) => [...new Set(ids.map((id) => id.toLowerCase()))];

// Reemplaza el conjunto entero: borra las filas del libro e inserta las nuevas. La tabla
// intermedia no tiene datos propios, así que es más simple que calcular diferencias.
async function setBookAuthors(db: DbOrTx, bookId: string, authorIds: string[]) {
  await db.delete(bookAuthors).where(eq(bookAuthors.bookId, bookId));
  const ids = uniqueIds(authorIds);
  if (ids.length > 0) {
    await db.insert(bookAuthors).values(ids.map((authorId) => ({ bookId, authorId })));
  }
}

async function setBookGenres(db: DbOrTx, bookId: string, genreIds: string[]) {
  await db.delete(bookGenres).where(eq(bookGenres.bookId, bookId));
  const ids = uniqueIds(genreIds);
  if (ids.length > 0) {
    await db.insert(bookGenres).values(ids.map((genreId) => ({ bookId, genreId })));
  }
}

// Si algo lanza dentro de la transacción, Drizzle hace `ROLLBACK` y el error sale por aquí:
// no queda un libro a medias. El detalle se lee después del `COMMIT`.
export async function createBook(
  db: DbOrTx,
  { authorIds, genreIds, ...fields }: CreateBookRequest,
): Promise<CreateBookResult> {
  try {
    const id = await db.transaction(async (tx) => {
      const [book] = await tx.insert(books).values(fields).returning({ id: books.id });
      await setBookAuthors(tx, book!.id, authorIds);
      await setBookGenres(tx, book!.id, genreIds);
      return book!.id;
    });
    return { status: 'ok', book: (await getBook(db, id))! };
  } catch (error) {
    const entity = invalidReferenceOf(error);
    if (entity) return { status: 'invalid_reference', entity };
    throw error;
  }
}

function invalidReferenceOf(error: unknown): InvalidReferenceEntity | undefined {
  if (!isForeignKeyViolation(error)) return undefined;
  const name = constraintOf(error);
  return name === undefined ? undefined : referenceConstraints[name];
}

// El `UPDATE` de `books` va siempre (con `updatedAt`, aunque solo cambien las relaciones):
// así el 404 sale del propio `RETURNING`. `undefined` no toca la columna y `null` la borra.
export async function updateBook(
  db: DbOrTx,
  id: string,
  { authorIds, genreIds, ...fields }: UpdateBookRequest,
): Promise<UpdateBookResult> {
  // Al quitar la saga el orden no tiene sentido: se limpia solo.
  const sagaOrder = fields.sagaId === null ? null : fields.sagaOrder;
  try {
    const found = await db.transaction(async (tx) => {
      const [book] = await tx
        .update(books)
        .set({ ...fields, sagaOrder, updatedAt: new Date() })
        .where(eq(books.id, id))
        .returning({ id: books.id });
      if (!book) return false;
      if (authorIds !== undefined) await setBookAuthors(tx, id, authorIds);
      if (genreIds !== undefined) await setBookGenres(tx, id, genreIds);
      return true;
    });
    if (!found) return { status: 'not_found' };
  } catch (error) {
    const entity = invalidReferenceOf(error);
    if (entity) return { status: 'invalid_reference', entity };
    // `sagaOrder` sobre un libro sin saga: Zod no lo ve (no conoce el estado actual).
    if (isCheckViolation(error)) return { status: 'saga_order_without_saga' };
    throw error;
  }
  const book = await getBook(db, id);
  return book ? { status: 'ok', book } : { status: 'not_found' };
}

// Las filas de `book_authors`, `book_genres`, `loans` y `readings` caen por `ON DELETE CASCADE`.
export async function deleteBook(db: DbOrTx, id: string): Promise<DeleteBookResult> {
  const [deleted] = await db.delete(books).where(eq(books.id, id)).returning({ id: books.id });
  return deleted ? { status: 'ok' } : { status: 'not_found' };
}

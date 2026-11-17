import type { BookDetail, CreateBookRequest, UpdateBookRequest } from '@jarvis/schemas';
import { and, eq, isNull } from 'drizzle-orm';
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

const bookColumns = {
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

// Consultas separadas en vez de un JOIN gigante: autores y géneros multiplicarían las filas.
// Autores y géneros salen por nombre (y `id` desempata nombres que solo difieren en mayúsculas).
export async function getBook(db: DbOrTx, id: string): Promise<BookDetail | undefined> {
  const [book] = await db.select(bookColumns).from(books).where(eq(books.id, id));
  if (!book) return undefined;

  const [bookAuthorRows, bookGenreRows, [saga], [activeLoan]] = await Promise.all([
    db
      .select({ id: authors.id, name: authors.name })
      .from(bookAuthors)
      .innerJoin(authors, eq(authors.id, bookAuthors.authorId))
      .where(eq(bookAuthors.bookId, id))
      .orderBy(authors.name, authors.id),
    db
      .select({ id: genres.id, name: genres.name })
      .from(bookGenres)
      .innerJoin(genres, eq(genres.id, bookGenres.genreId))
      .where(eq(bookGenres.bookId, id))
      .orderBy(genres.name, genres.id),
    book.sagaId === null
      ? Promise.resolve([])
      : db.select({ id: sagas.id, name: sagas.name }).from(sagas).where(eq(sagas.id, book.sagaId)),
    // El índice único parcial garantiza como mucho un préstamo sin devolver por libro.
    db
      .select({
        id: loans.id,
        bookId: loans.bookId,
        borrower: loans.borrower,
        loanedAt: loans.loanedAt,
        returnedAt: loans.returnedAt,
      })
      .from(loans)
      .where(and(eq(loans.bookId, id), isNull(loans.returnedAt))),
  ]);

  return {
    ...book,
    authors: bookAuthorRows,
    genres: bookGenreRows,
    saga: saga ?? null,
    activeLoan: activeLoan ?? null,
  };
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

import { IsbnSchema, LanguageSchema } from '@jarvis/schemas';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createUser, expectPgCode, testDb } from '../../test/helpers.js';
import { isUniqueViolation } from '../errors.js';
import {
  authors,
  bookAuthors,
  bookGenres,
  books,
  genres,
  loans,
  readings,
  sagas,
} from './library.js';

// Códigos de Postgres: `check_violation` y `restrict_violation`. Un `ON DELETE RESTRICT`
// da 23001, no el 23503 (`foreign_key_violation`) de `NO ACTION` ni de un id inexistente.
const CHECK_VIOLATION = '23514';
const RESTRICT_VIOLATION = '23001';

async function createBook(values: Partial<typeof books.$inferInsert> = {}) {
  const [book] = await testDb
    .insert(books)
    .values({ title: 'Fundación', ...values })
    .returning();
  return book!;
}

describe('nombres únicos sin distinguir mayúsculas', () => {
  it.each([
    ['autores', authors],
    ['géneros', genres],
    ['sagas', sagas],
  ] as const)('%s: «Asimov» y «asimov» chocan', async (_name, table) => {
    await testDb.insert(table).values({ name: 'Asimov' });

    await expect(testDb.insert(table).values({ name: 'asimov' })).rejects.toSatisfy(
      isUniqueViolation,
    );
  });
});

describe('books', () => {
  it('saga_order sin saga_id falla el CHECK', async () => {
    await expectPgCode(createBook({ sagaOrder: 1 }), CHECK_VIOLATION);
  });

  it('saga_order 2.5 se guarda y se lee como número', async () => {
    const [saga] = await testDb.insert(sagas).values({ name: 'Fundación' }).returning();
    const book = await createBook({ sagaId: saga!.id, sagaOrder: 2.5 });

    expect(book.sagaOrder).toBe(2.5);
  });
});

describe('loans', () => {
  it('un segundo préstamo activo del mismo libro falla; tras devolver, se puede prestar', async () => {
    const book = await createBook();
    const [first] = await testDb
      .insert(loans)
      .values({ bookId: book.id, borrower: 'Ana', loanedAt: '2026-11-01' })
      .returning();

    await expect(
      testDb.insert(loans).values({ bookId: book.id, borrower: 'Luis', loanedAt: '2026-11-02' }),
    ).rejects.toSatisfy(isUniqueViolation);

    await testDb.update(loans).set({ returnedAt: '2026-11-05' }).where(eq(loans.id, first!.id));
    await testDb
      .insert(loans)
      .values({ bookId: book.id, borrower: 'Luis', loanedAt: '2026-11-06' });

    expect(await testDb.select().from(loans)).toHaveLength(2);
  });

  it('returned_at anterior a loaned_at falla el CHECK', async () => {
    const book = await createBook();

    await expectPgCode(
      testDb.insert(loans).values({
        bookId: book.id,
        borrower: 'Ana',
        loanedAt: '2026-11-05',
        returnedAt: '2026-11-01',
      }),
      CHECK_VIOLATION,
    );
  });

  it('las fechas se leen como texto YYYY-MM-DD', async () => {
    const book = await createBook();
    const [loan] = await testDb
      .insert(loans)
      .values({ bookId: book.id, borrower: 'Ana', loanedAt: '2026-11-15' })
      .returning();

    expect(loan!.loanedAt).toBe('2026-11-15');
    expect(loan!.returnedAt).toBeNull();
  });
});

describe('readings', () => {
  async function insertReading(values: Partial<typeof readings.$inferInsert>) {
    const book = await createBook();
    const user = await createUser();
    return testDb.insert(readings).values({ bookId: book.id, userId: user.id, ...values });
  }

  it.each([0, 6])('rating %i falla el CHECK', async (rating) => {
    await expectPgCode(insertReading({ startedAt: '2026-11-01', rating }), CHECK_VIOLATION);
  });

  it('sin ninguna fecha falla el CHECK', async () => {
    await expectPgCode(insertReading({}), CHECK_VIOLATION);
  });

  it('con fin anterior al inicio falla el CHECK', async () => {
    await expectPgCode(
      insertReading({ startedAt: '2026-11-05', finishedAt: '2026-11-01' }),
      CHECK_VIOLATION,
    );
  });

  it('solo con inicio se guarda', async () => {
    await insertReading({ startedAt: '2026-11-01' });

    const [reading] = await testDb.select().from(readings);
    expect(reading).toMatchObject({ startedAt: '2026-11-01', finishedAt: null, rating: null });
  });
});

describe('borrados', () => {
  it('borrar un libro borra sus préstamos, lecturas y relaciones', async () => {
    const book = await createBook();
    const user = await createUser();
    const [author] = await testDb.insert(authors).values({ name: 'Asimov' }).returning();
    const [genre] = await testDb.insert(genres).values({ name: 'Ciencia ficción' }).returning();
    await testDb.insert(bookAuthors).values({ bookId: book.id, authorId: author!.id });
    await testDb.insert(bookGenres).values({ bookId: book.id, genreId: genre!.id });
    await testDb.insert(loans).values({ bookId: book.id, borrower: 'Ana', loanedAt: '2026-11-01' });
    await testDb
      .insert(readings)
      .values({ bookId: book.id, userId: user.id, startedAt: '2026-11-01' });

    await testDb.delete(books).where(eq(books.id, book.id));

    expect(await testDb.select().from(loans)).toHaveLength(0);
    expect(await testDb.select().from(readings)).toHaveLength(0);
    expect(await testDb.select().from(bookAuthors)).toHaveLength(0);
    expect(await testDb.select().from(bookGenres)).toHaveLength(0);
    // Autor y género no se tocan.
    expect(await testDb.select().from(authors)).toHaveLength(1);
    expect(await testDb.select().from(genres)).toHaveLength(1);
  });

  it('borrar un autor con libros falla; sin libros se borra', async () => {
    const book = await createBook();
    const [author] = await testDb.insert(authors).values({ name: 'Asimov' }).returning();
    await testDb.insert(bookAuthors).values({ bookId: book.id, authorId: author!.id });

    await expectPgCode(
      testDb.delete(authors).where(eq(authors.id, author!.id)),
      RESTRICT_VIOLATION,
    );

    await testDb.delete(bookAuthors);
    await testDb.delete(authors).where(eq(authors.id, author!.id));
    expect(await testDb.select().from(authors)).toHaveLength(0);
  });

  it('borrar un género con libros falla; sin libros se borra', async () => {
    const book = await createBook();
    const [genre] = await testDb.insert(genres).values({ name: 'Ensayo' }).returning();
    await testDb.insert(bookGenres).values({ bookId: book.id, genreId: genre!.id });

    await expectPgCode(testDb.delete(genres).where(eq(genres.id, genre!.id)), RESTRICT_VIOLATION);

    await testDb.delete(bookGenres);
    await testDb.delete(genres).where(eq(genres.id, genre!.id));
    expect(await testDb.select().from(genres)).toHaveLength(0);
  });

  it('borrar una saga con libros falla; sin libros se borra', async () => {
    const [saga] = await testDb.insert(sagas).values({ name: 'Fundación' }).returning();
    const book = await createBook({ sagaId: saga!.id });

    await expectPgCode(testDb.delete(sagas).where(eq(sagas.id, saga!.id)), RESTRICT_VIOLATION);

    await testDb.delete(books).where(eq(books.id, book.id));
    await testDb.delete(sagas).where(eq(sagas.id, saga!.id));
    expect(await testDb.select().from(sagas)).toHaveLength(0);
  });
});

describe('IsbnSchema', () => {
  it('quita guiones y espacios y pasa a mayúsculas', () => {
    expect(IsbnSchema.parse('978-84-376-0494-7')).toBe('9788437604947');
    expect(IsbnSchema.parse('84-376-0494-x')).toBe('843760494X');
  });

  it('rechaza 11 dígitos', () => {
    expect(IsbnSchema.safeParse('12345678901').success).toBe(false);
  });
});

describe('LanguageSchema', () => {
  it('recorta y pasa a minúsculas', () => {
    expect(LanguageSchema.parse(' ES ')).toBe('es');
  });

  it('rechaza más de dos letras', () => {
    expect(LanguageSchema.safeParse('esp').success).toBe(false);
  });
});

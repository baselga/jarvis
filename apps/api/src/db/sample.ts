import { parseArgs } from 'node:util';

import type { DateString } from '@jarvis/schemas';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { hashPassword } from '../auth/password.js';
import { loadConfig } from '../config.js';
import { todayIn } from '../dates.js';
import { createDb, type DbOrTx } from './client.js';
import {
  SAMPLE_AUTHORS,
  SAMPLE_BOOKS,
  SAMPLE_EMAILS,
  SAMPLE_GENRES,
  SAMPLE_LOANS,
  SAMPLE_PASSWORD,
  SAMPLE_READINGS,
  SAMPLE_SAGAS,
  SAMPLE_USERS,
} from './sample-data.js';
import {
  authors,
  bookAuthors,
  bookGenres,
  books,
  genres,
  loans,
  readings,
  sagas,
  users,
} from './schema/index.js';

// Script `pnpm db:sample [--reset]`: llena la BD de desarrollo con `sample-data.ts`.
// Todo en una transacción: o se crea todo o nada. Nunca en producción.

// Datos previos sin `--reset`: se lanza dentro de la transacción (→ ROLLBACK) y se
// distingue fuera de un fallo inesperado.
class SampleDataExistsError extends Error {}

// `today` menos `days` días. Aritmética de calendario en UTC sobre un día ya resuelto
// en `HOME_TZ`: aquí `toISOString()` no cambia de día, porque no hay hora de por medio.
function daysAgo(today: DateString, days: number): DateString {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function idOf(ids: Map<string, string>, name: string): string {
  const id = ids.get(name);
  if (id === undefined) throw new Error(`Falta «${name}» en los datos de ejemplo`);
  return id;
}

async function hasData(tx: DbOrTx): Promise<boolean> {
  const [row] = await tx.execute<{ found: boolean }>(sql`
    select exists (select 1 from ${books})
      or exists (select 1 from ${authors})
      or exists (select 1 from ${genres})
      or exists (select 1 from ${sagas})
      or exists (select 1 from ${users} where ${inArray(users.email, SAMPLE_EMAILS)})
      as found
  `);
  return row?.found ?? false;
}

// Vacía la biblioteca (lecturas de todos incluidas) y borra solo los usuarios de
// ejemplo; sus sesiones caen por `ON DELETE CASCADE`. El admin no se toca.
async function reset(tx: DbOrTx) {
  await tx.execute(
    sql`truncate ${books}, ${authors}, ${genres}, ${sagas}, ${bookAuthors}, ${bookGenres}, ${loans}, ${readings}`,
  );
  await tx.delete(users).where(inArray(users.email, SAMPLE_EMAILS));
}

async function insertSample(tx: DbOrTx, today: DateString, passwordHash: string) {
  const insertedUsers = await tx
    .insert(users)
    .values(Object.values(SAMPLE_USERS).map((user) => ({ ...user, passwordHash, active: true })))
    .returning({ id: users.id, email: users.email });
  const userIds = new Map(insertedUsers.map((user) => [user.email, user.id]));

  const [admin] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.active, true)))
    .orderBy(asc(users.createdAt))
    .limit(1);
  const readerIds = {
    adult: idOf(userIds, SAMPLE_USERS.adult.email),
    admin: admin?.id,
  };

  const byName = (rows: { id: string; name: string }[]) =>
    new Map(rows.map((row) => [row.name, row.id]));
  const authorIds = byName(
    await tx
      .insert(authors)
      .values(SAMPLE_AUTHORS.map((name) => ({ name })))
      .returning({ id: authors.id, name: authors.name }),
  );
  const genreIds = byName(
    await tx
      .insert(genres)
      .values(SAMPLE_GENRES.map((name) => ({ name })))
      .returning({ id: genres.id, name: genres.name }),
  );
  const sagaIds = byName(
    await tx
      .insert(sagas)
      .values(SAMPLE_SAGAS.map((name) => ({ name })))
      .returning({ id: sagas.id, name: sagas.name }),
  );

  const insertedBooks = await tx
    .insert(books)
    .values(
      SAMPLE_BOOKS.map(({ title, saga, isbn, year, language, location, notes }) => ({
        title,
        sagaId: saga && idOf(sagaIds, saga.name),
        sagaOrder: saga?.order,
        isbn,
        year,
        language,
        location,
        notes,
      })),
    )
    .returning({ id: books.id, title: books.title });
  const bookIds = new Map(insertedBooks.map((book) => [book.title, book.id]));

  await tx.insert(bookAuthors).values(
    SAMPLE_BOOKS.flatMap((book) =>
      book.authors.map((name) => ({
        bookId: idOf(bookIds, book.title),
        authorId: idOf(authorIds, name),
      })),
    ),
  );
  await tx.insert(bookGenres).values(
    SAMPLE_BOOKS.flatMap((book) =>
      book.genres.map((name) => ({
        bookId: idOf(bookIds, book.title),
        genreId: idOf(genreIds, name),
      })),
    ),
  );

  await tx.insert(loans).values(
    SAMPLE_LOANS.map((loan) => ({
      bookId: idOf(bookIds, loan.book),
      borrower: loan.borrower,
      loanedAt: daysAgo(today, loan.loanedDaysAgo),
      returnedAt: loan.returnedDaysAgo === undefined ? null : daysAgo(today, loan.returnedDaysAgo),
    })),
  );

  const sampleReadings = SAMPLE_READINGS.flatMap((reading) => {
    const userId = readerIds[reading.reader];
    if (userId === undefined) return [];
    return [
      {
        bookId: idOf(bookIds, reading.book),
        userId,
        startedAt:
          reading.startedDaysAgo === undefined ? null : daysAgo(today, reading.startedDaysAgo),
        finishedAt:
          reading.finishedDaysAgo === undefined ? null : daysAgo(today, reading.finishedDaysAgo),
        rating: reading.rating ?? null,
        note: reading.note ?? null,
      },
    ];
  });
  await tx.insert(readings).values(sampleReadings);

  return {
    books: insertedBooks.length,
    authors: authorIds.size,
    genres: genreIds.size,
    sagas: sagaIds.size,
    activeLoans: SAMPLE_LOANS.filter((loan) => loan.returnedDaysAgo === undefined).length,
    returnedLoans: SAMPLE_LOANS.filter((loan) => loan.returnedDaysAgo !== undefined).length,
    readings: sampleReadings.length,
    hasAdmin: admin !== undefined,
  };
}

async function main(): Promise<number> {
  const config = loadConfig();
  if (config.NODE_ENV === 'production') {
    console.error('db:sample no se ejecuta en producción');
    return 1;
  }

  let resetRequested: boolean;
  try {
    const { values } = parseArgs({
      options: { reset: { type: 'boolean', default: false } },
      strict: true,
    });
    resetRequested = values.reset;
  } catch (error) {
    console.error(`${(error as Error).message}\nUso: pnpm db:sample [--reset]`);
    return 1;
  }

  // argon2 es lento a propósito: el hash se calcula una vez y fuera de la transacción.
  const passwordHash = await hashPassword(SAMPLE_PASSWORD);
  const today = todayIn(config.HOME_TZ);
  const { db, close } = createDb(config.DATABASE_URL);
  try {
    const summary = await db.transaction(async (tx) => {
      if (await hasData(tx)) {
        if (!resetRequested) throw new SampleDataExistsError();
        await reset(tx);
      }
      return insertSample(tx, today, passwordHash);
    });
    console.log(
      [
        'Datos de ejemplo creados:',
        `  ${summary.books} libros, ${summary.authors} autores, ${summary.genres} géneros, ${summary.sagas} sagas`,
        `  ${summary.activeLoans} préstamos activos y ${summary.returnedLoans} devueltos`,
        `  ${summary.readings} lecturas`,
        ...(summary.hasAdmin
          ? []
          : ['  Sin admin: ejecuta db:seed para tener también sus lecturas']),
        `Usuarios (contraseña «${SAMPLE_PASSWORD}»):`,
        ...Object.values(SAMPLE_USERS).map((user) => `  ${user.email} (${user.role})`),
      ].join('\n'),
    );
    return 0;
  } catch (error) {
    if (error instanceof SampleDataExistsError) {
      console.error(
        'La BD ya tiene datos de la biblioteca o usuarios de ejemplo. Usa --reset para borrarlos y volver a crearlos.',
      );
    } else {
      console.error('Error al crear los datos de ejemplo:', error);
    }
    return 1;
  } finally {
    await close();
  }
}

process.exitCode = await main();

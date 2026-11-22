import type { Role } from '@jarvis/schemas';
import { sql } from 'drizzle-orm';

import { buildApp, type BuildAppOptions } from '../app.js';
import { hashPassword } from '../auth/password.js';
import { generateSessionToken, hashSessionToken, SESSION_TTL_MS } from '../auth/session.js';
import { createDb } from '../db/client.js';
import {
  authors,
  bookAuthors,
  bookGenres,
  books,
  genres,
  loans,
  readings,
  sagas,
  sessions,
  users,
} from '../db/schema/index.js';
import { testDatabaseUrl } from './env.js';

// Una conexión por archivo de test (Vitest aísla los módulos por archivo);
// la cierra `setup.ts` al terminar el archivo.
const testConnection = createDb(testDatabaseUrl());
export const testDb = testConnection.db;
export const closeTestDb = testConnection.close;

// Vacía todas las tablas del esquema `public` (las migraciones viven en `drizzle`).
// Se leen de `pg_tables` para que las tablas nuevas se vacíen sin tocar esto.
export async function resetDb() {
  const rows = await testDb.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await testDb.execute(sql.raw(`truncate ${tables} restart identity cascade`));
}

// App con la BD de test. Quien la usa hace `app.close()` (no cierra la BD).
export function buildTestApp(options: Omit<BuildAppOptions, 'db'> = {}) {
  return buildApp({ ...options, db: testDb });
}

let userCounter = 0;

// Inserta un usuario con valores por defecto válidos y únicos.
// Solo hashea si se pasa `password` (argon2 es lento a propósito); si no,
// guarda un hash de relleno con el que ninguna contraseña es válida.
export async function createUser({
  password,
  ...overrides
}: Partial<{ name: string; email: string; role: Role; active: boolean; password: string }> = {}) {
  userCounter += 1;
  const [user] = await testDb
    .insert(users)
    .values({
      name: `User ${userCounter}`,
      email: `user-${userCounter}@test.local`,
      role: 'adult',
      active: true,
      passwordHash: password === undefined ? 'not-a-hash' : await hashPassword(password),
      ...overrides,
    })
    .returning();
  return user!;
}

// Inserta una sesión y devuelve el token en claro (lo que tendría el cliente).
// A diferencia de `createSession` de `auth/session.ts`, permite fijar `expiresAt`
// (sesiones caducadas o a punto de renovarse) y no borra las caducadas.
export async function createSession(userId: string, { expiresAt }: { expiresAt?: Date } = {}) {
  const token = generateSessionToken();
  const [session] = await testDb
    .insert(sessions)
    .values({
      id: hashSessionToken(token),
      userId,
      expiresAt: expiresAt ?? new Date(Date.now() + SESSION_TTL_MS),
    })
    .returning();
  return { token, session: session! };
}

let authorCounter = 0;

// Inserta un autor con nombre único por defecto.
export async function createAuthor({ name }: { name?: string } = {}) {
  authorCounter += 1;
  const [author] = await testDb
    .insert(authors)
    .values({ name: name ?? `Author ${authorCounter}` })
    .returning();
  return author!;
}

let genreCounter = 0;

// Inserta un género con nombre único por defecto.
export async function createGenre({ name }: { name?: string } = {}) {
  genreCounter += 1;
  const [genre] = await testDb
    .insert(genres)
    .values({ name: name ?? `Genre ${genreCounter}` })
    .returning();
  return genre!;
}

let sagaCounter = 0;

// Inserta una saga con nombre único por defecto.
export async function createSaga({ name }: { name?: string } = {}) {
  sagaCounter += 1;
  const [saga] = await testDb
    .insert(sagas)
    .values({ name: name ?? `Saga ${sagaCounter}` })
    .returning();
  return saga!;
}

let bookCounter = 0;

// Inserta un libro y lo vincula a `authorIds` y `genreIds` (todavía no hay rutas de libros).
// `sagaOrder` solo vale con `sagaId` (lo exige un `check` de la BD).
export async function createBook({
  title,
  authorIds = [],
  genreIds = [],
  sagaId,
  sagaOrder,
}: {
  title?: string;
  authorIds?: string[];
  genreIds?: string[];
  sagaId?: string;
  sagaOrder?: number;
} = {}) {
  bookCounter += 1;
  const [book] = await testDb
    .insert(books)
    .values({ title: title ?? `Book ${bookCounter}`, sagaId, sagaOrder })
    .returning();
  if (authorIds.length > 0) {
    await testDb
      .insert(bookAuthors)
      .values(authorIds.map((authorId) => ({ bookId: book!.id, authorId })));
  }
  if (genreIds.length > 0) {
    await testDb
      .insert(bookGenres)
      .values(genreIds.map((genreId) => ({ bookId: book!.id, genreId })));
  }
  return book!;
}

// Inserta un préstamo con valores por defecto válidos; sin `returnedAt` está activo.
export async function createLoan({
  bookId,
  borrower = 'Vecina',
  loanedAt = '2026-01-10',
  returnedAt,
}: {
  bookId: string;
  borrower?: string;
  loanedAt?: string;
  returnedAt?: string;
}) {
  const [loan] = await testDb
    .insert(loans)
    .values({ bookId, borrower, loanedAt, returnedAt })
    .returning();
  return loan!;
}

// Inserta una lectura con valores por defecto válidos (terminada); `finishedAt: null` = «leyendo».
export async function createReading({
  bookId,
  userId,
  startedAt = '2026-01-10',
  finishedAt = '2026-02-10',
  rating = null,
  note = null,
}: {
  bookId: string;
  userId: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  rating?: number | null;
  note?: string | null;
}) {
  const [reading] = await testDb
    .insert(readings)
    .values({ bookId, userId, startedAt, finishedAt, rating, note })
    .returning();
  return reading!;
}

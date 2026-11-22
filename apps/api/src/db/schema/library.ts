import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './users.js';

// Las reglas del dominio van también en la BD (`check`, índice único parcial,
// `onDelete`): la API da el 400/409 con mensaje útil y la BD es la última línea.

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const authors = pgTable(
  'authors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('authors_name_lower_idx').on(sql`lower(${table.name})`)],
);

export const genres = pgTable(
  'genres',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('genres_name_lower_idx').on(sql`lower(${table.name})`)],
);

export const sagas = pgTable(
  'sagas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('sagas_name_lower_idx').on(sql`lower(${table.name})`)],
);

export const books = pgTable(
  'books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    sagaId: uuid('saga_id').references(() => sagas.id, { onDelete: 'restrict' }),
    // numeric es exacto (2.5); `mode: 'number'` lo lee como número en vez de texto.
    sagaOrder: numeric('saga_order', { precision: 5, scale: 1, mode: 'number' }),
    isbn: text('isbn'),
    year: integer('year'),
    language: text('language'),
    location: text('location'),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => [
    check(
      'books_saga_order_needs_saga',
      sql`${table.sagaOrder} IS NULL OR ${table.sagaId} IS NOT NULL`,
    ),
    index('books_saga_id_idx').on(table.sagaId),
  ],
);

export const bookAuthors = pgTable(
  'book_authors',
  {
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => authors.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.bookId, table.authorId] }),
    // La PK compuesta solo sirve para buscar por `book_id`.
    index('book_authors_author_id_idx').on(table.authorId),
  ],
);

export const bookGenres = pgTable(
  'book_genres',
  {
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.bookId, table.genreId] }),
    index('book_genres_genre_id_idx').on(table.genreId),
  ],
);

// Las columnas `date` son un día sin hora: se leen como texto `YYYY-MM-DD`.
export const loans = pgTable(
  'loans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    borrower: text('borrower').notNull(),
    // Sin default: `CURRENT_DATE` usaría la zona horaria del servidor.
    loanedAt: date('loaned_at').notNull(),
    returnedAt: date('returned_at'),
    ...timestamps,
  },
  (table) => [
    // Un solo préstamo activo por libro; los devueltos no cuentan.
    uniqueIndex('loans_active_book_idx')
      .on(table.bookId)
      .where(sql`${table.returnedAt} IS NULL`),
    check(
      'loans_returned_after_loaned',
      sql`${table.returnedAt} IS NULL OR ${table.returnedAt} >= ${table.loanedAt}`,
    ),
    index('loans_book_id_idx').on(table.bookId),
  ],
);

export const readings = pgTable(
  'readings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    startedAt: date('started_at'),
    finishedAt: date('finished_at'),
    rating: smallint('rating'),
    note: text('note'),
    ...timestamps,
  },
  (table) => [
    check('readings_rating_range', sql`${table.rating} IS NULL OR ${table.rating} BETWEEN 1 AND 5`),
    check(
      'readings_has_date',
      sql`${table.startedAt} IS NOT NULL OR ${table.finishedAt} IS NOT NULL`,
    ),
    check(
      'readings_finished_after_started',
      sql`${table.startedAt} IS NULL OR ${table.finishedAt} IS NULL OR ${table.finishedAt} >= ${table.startedAt}`,
    ),
    index('readings_book_id_idx').on(table.bookId),
    index('readings_user_id_idx').on(table.userId),
  ],
);

import { z } from 'zod';

import { AuthorSchema } from './author.js';
import {
  BookLocationSchema,
  BookNotesSchema,
  BookSchema,
  BookTitleSchema,
  BookYearSchema,
  IsbnSchema,
  LanguageSchema,
  SagaOrderSchema,
} from './book.js';
import { GenreSchema } from './genre.js';
import { LoanSchema } from './loan.js';
import { PaginationQuerySchema } from './pagination.js';
import { SagaSchema } from './saga.js';

// Vive aparte de `book.ts` porque necesita `SagaSchema`, y `saga.ts` ya importa `book.ts`:
// juntarlos crearía un ciclo de importación.

// Los límites evitan que una petición meta cientos de filas en las tablas intermedias.
const MAX_RELATIONS = 20;

// Un campo opcional vacío no vale: se manda `null` (o no se manda). Los esquemas de
// campo ya exigen `min(1)`.
const bookFields = {
  authorIds: z.array(z.uuid()).max(MAX_RELATIONS),
  genreIds: z.array(z.uuid()).max(MAX_RELATIONS),
  sagaId: z.uuid().nullable().optional(),
  sagaOrder: SagaOrderSchema.nullable().optional(),
  isbn: IsbnSchema.nullable().optional(),
  year: BookYearSchema.nullable().optional(),
  language: LanguageSchema.nullable().optional(),
  location: BookLocationSchema.nullable().optional(),
  notes: BookNotesSchema.nullable().optional(),
};

export const CreateBookRequestSchema = z
  .object({
    ...bookFields,
    title: BookTitleSchema,
    authorIds: bookFields.authorIds.default([]),
    genreIds: bookFields.genreIds.default([]),
  })
  .refine((body) => body.sagaOrder == null || body.sagaId != null, {
    message: 'El orden en la saga necesita una saga',
    path: ['sagaOrder'],
  });

export type CreateBookRequest = z.infer<typeof CreateBookRequestSchema>;

// `PATCH` parcial: lo omitido no cambia y `null` borra el campo. `authorIds` y `genreIds`,
// si vienen, sustituyen el conjunto entero (`[]` = quitar todos).
export const UpdateBookRequestSchema = z
  .object({
    ...bookFields,
    title: BookTitleSchema.optional(),
    authorIds: bookFields.authorIds.optional(),
    genreIds: bookFields.genreIds.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Hay que indicar al menos un campo',
  })
  .refine((body) => !(body.sagaId === null && body.sagaOrder != null), {
    message: 'El orden en la saga necesita una saga',
    path: ['sagaOrder'],
  });

export type UpdateBookRequest = z.infer<typeof UpdateBookRequestSchema>;

// Un id mal formado da 400 de validación en vez de un 500 de Postgres.
export const BookIdParamsSchema = z.object({ id: z.uuid() });

export type BookIdParams = z.infer<typeof BookIdParamsSchema>;

// El libro plano más sus relaciones. `activeLoan` es el préstamo sin devolver:
// «prestado» = `activeLoan !== null`.
export const BookDetailSchema = BookSchema.extend({
  authors: z.array(AuthorSchema),
  genres: z.array(GenreSchema),
  saga: SagaSchema.nullable(),
  activeLoan: LoanSchema.nullable(),
});

export type BookDetail = z.infer<typeof BookDetailSchema>;

// Filtros del listado, combinados con AND. Un id de filtro inexistente no es un error:
// da una lista vacía. `z.coerce.boolean()` convertiría `"false"` en `true` (texto no
// vacío), así que `loaned` solo acepta `true`/`false`, en minúsculas.
export const BookListQuerySchema = PaginationQuerySchema.extend({
  q: z.string().trim().min(1).max(200).optional(),
  authorId: z.uuid().optional(),
  genreId: z.uuid().optional(),
  sagaId: z.uuid().optional(),
  loaned: z
    .stringbool({ truthy: ['true'], falsy: ['false'], case: 'sensitive' })
    .optional()
    .describe('`true`: solo prestados; `false`: solo no prestados'),
});

export type BookListQuery = z.infer<typeof BookListQuerySchema>;

// `total` cuenta los libros que cumplen los filtros, sin `limit` ni `offset`.
export const BookListResponseSchema = z.object({
  books: z.array(BookDetailSchema),
  total: z.number().int().min(0),
});

export type BookListResponse = z.infer<typeof BookListResponseSchema>;

import { z } from 'zod';

import { DateSchema } from './date.js';
import { PaginationQuerySchema } from './pagination.js';

export const RatingSchema = z.int().min(1).max(5);

export const ReadingNoteSchema = z.string().trim().min(1).max(2000);

// Sin fin = «leyendo»; al menos una de las dos fechas (lo garantiza la BD).
export const ReadingSchema = z.object({
  id: z.uuid(),
  bookId: z.uuid(),
  userId: z.uuid(),
  startedAt: DateSchema.nullable(),
  finishedAt: DateSchema.nullable(),
  rating: z.number().nullable(),
  note: z.string().nullable(),
});

export type Reading = z.infer<typeof ReadingSchema>;

export const ReadingIdParamsSchema = z.object({ id: z.uuid() });

export type ReadingIdParams = z.infer<typeof ReadingIdParamsSchema>;

// También los usa la API para traducir los `check` de la BD en la edición: un único texto por regla.
export const readingDateMessages = {
  noDate: 'Indica al menos la fecha de inicio o la de fin',
  finishedBeforeStarted: 'El fin no puede ser anterior al inicio',
};

// Los textos `YYYY-MM-DD` se ordenan igual que las fechas: basta con compararlos.
const finishedAfterStarted = (body: { startedAt?: string | null; finishedAt?: string | null }) =>
  body.startedAt == null || body.finishedAt == null || body.finishedAt >= body.startedAt;

// El usuario no va en el cuerpo: la lectura es siempre del de la sesión. Sin ninguna fecha
// (o sin cuerpo), la API pone `startedAt` = hoy en la zona de casa: «empiezo a leerlo».
export const CreateReadingRequestSchema = z
  .object({
    startedAt: DateSchema.optional(),
    finishedAt: DateSchema.optional(),
    rating: RatingSchema.optional(),
    note: ReadingNoteSchema.optional(),
  })
  .refine(finishedAfterStarted, {
    message: readingDateMessages.finishedBeforeStarted,
    path: ['finishedAt'],
  })
  // `.nullish()` y no `.optional()`: Fastify valida un cuerpo ausente como `null`.
  .nullish();

export type CreateReadingRequest = z.infer<typeof CreateReadingRequestSchema>;

// Ausente = no tocar; `null` = vaciar. Las reglas que dependen de lo guardado
// (quedarse sin fechas, fin anterior al inicio guardado) las comprueba la BD.
export const UpdateReadingRequestSchema = z
  .object({
    startedAt: DateSchema.nullable().optional(),
    finishedAt: DateSchema.nullable().optional(),
    rating: RatingSchema.nullable().optional(),
    note: ReadingNoteSchema.nullable().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Indica al menos un campo que cambiar',
  })
  .refine(finishedAfterStarted, {
    message: readingDateMessages.finishedBeforeStarted,
    path: ['finishedAt'],
  });

export type UpdateReadingRequest = z.infer<typeof UpdateReadingRequestSchema>;

export const ReadingListQuerySchema = PaginationQuerySchema.extend({
  bookId: z.uuid().optional(),
  userId: z.uuid().optional(),
});

export type ReadingListQuery = z.infer<typeof ReadingListQuerySchema>;

// Solo lo que hace falta para mostrarla: quién la leyó y qué libro (no el detalle entero).
export const ReadingListItemSchema = ReadingSchema.extend({
  user: z.object({ id: z.uuid(), name: z.string() }),
  book: z.object({ id: z.uuid(), title: z.string() }),
});

export type ReadingListItem = z.infer<typeof ReadingListItemSchema>;

export const ReadingListResponseSchema = z.object({
  readings: z.array(ReadingListItemSchema),
  total: z.number(),
});

export type ReadingListResponse = z.infer<typeof ReadingListResponseSchema>;

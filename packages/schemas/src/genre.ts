import { z } from 'zod';

import { PaginationQuerySchema } from './pagination.js';

export const GenreNameSchema = z.string().trim().min(1).max(200);

// Sin distinguir mayúsculas, el nombre no se puede repetir (lo garantiza la BD).
export const GenreSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export type Genre = z.infer<typeof GenreSchema>;

export const CreateGenreRequestSchema = z.object({ name: GenreNameSchema });

export type CreateGenreRequest = z.infer<typeof CreateGenreRequestSchema>;

// Hoy solo se edita el nombre, y es obligatorio (mismo molde para el resto de la biblioteca).
export const UpdateGenreRequestSchema = CreateGenreRequestSchema;

export type UpdateGenreRequest = z.infer<typeof UpdateGenreRequestSchema>;

// Un id mal formado da 400 de validación en vez de un 500 de Postgres.
export const GenreIdParamsSchema = z.object({ id: z.uuid() });

export type GenreIdParams = z.infer<typeof GenreIdParamsSchema>;

export const GenreListQuerySchema = PaginationQuerySchema.extend({
  q: z.string().trim().min(1).max(200).optional(),
});

export type GenreListQuery = z.infer<typeof GenreListQuerySchema>;

// `total` cuenta los géneros que cumplen `q`, sin `limit` ni `offset`.
export const GenreListResponseSchema = z.object({
  genres: z.array(GenreSchema),
  total: z.number().int().min(0),
});

export type GenreListResponse = z.infer<typeof GenreListResponseSchema>;

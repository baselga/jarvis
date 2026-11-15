import { z } from 'zod';
import { PaginationQuerySchema } from './pagination.js';

export const AuthorNameSchema = z.string().trim().min(1).max(200);

// Sin distinguir mayúsculas, el nombre no se puede repetir (lo garantiza la BD).
export const AuthorSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export type Author = z.infer<typeof AuthorSchema>;

export const CreateAuthorRequestSchema = z.object({ name: AuthorNameSchema });

export type CreateAuthorRequest = z.infer<typeof CreateAuthorRequestSchema>;

// Hoy solo se edita el nombre, y es obligatorio (mismo molde para el resto de la biblioteca).
export const UpdateAuthorRequestSchema = CreateAuthorRequestSchema;

export type UpdateAuthorRequest = z.infer<typeof UpdateAuthorRequestSchema>;

// Un id mal formado da 400 de validación en vez de un 500 de Postgres.
export const AuthorIdParamsSchema = z.object({ id: z.uuid() });

export type AuthorIdParams = z.infer<typeof AuthorIdParamsSchema>;

export const AuthorListQuerySchema = PaginationQuerySchema.extend({
  q: z.string().trim().min(1).max(200).optional(),
});

export type AuthorListQuery = z.infer<typeof AuthorListQuerySchema>;

// `total` cuenta los autores que cumplen `q`, sin `limit` ni `offset`.
export const AuthorListResponseSchema = z.object({
  authors: z.array(AuthorSchema),
  total: z.number().int().min(0),
});

export type AuthorListResponse = z.infer<typeof AuthorListResponseSchema>;

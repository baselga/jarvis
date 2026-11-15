import { z } from 'zod';
import { BookSchema } from './book.js';
import { PaginationQuerySchema } from './pagination.js';

export const SagaNameSchema = z.string().trim().min(1).max(200);

// Sin distinguir mayúsculas, el nombre no se puede repetir (lo garantiza la BD).
export const SagaSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export type Saga = z.infer<typeof SagaSchema>;

export const CreateSagaRequestSchema = z.object({ name: SagaNameSchema });

export type CreateSagaRequest = z.infer<typeof CreateSagaRequestSchema>;

// Hoy solo se edita el nombre, y es obligatorio (mismo molde para el resto de la biblioteca).
export const UpdateSagaRequestSchema = CreateSagaRequestSchema;

export type UpdateSagaRequest = z.infer<typeof UpdateSagaRequestSchema>;

// Un id mal formado da 400 de validación en vez de un 500 de Postgres.
export const SagaIdParamsSchema = z.object({ id: z.uuid() });

export type SagaIdParams = z.infer<typeof SagaIdParamsSchema>;

export const SagaListQuerySchema = PaginationQuerySchema.extend({
  q: z.string().trim().min(1).max(200).optional(),
});

export type SagaListQuery = z.infer<typeof SagaListQuerySchema>;

// `total` cuenta las sagas que cumplen `q`, sin `limit` ni `offset`.
export const SagaListResponseSchema = z.object({
  sagas: z.array(SagaSchema),
  total: z.number().int().min(0),
});

export type SagaListResponse = z.infer<typeof SagaListResponseSchema>;

// Detalle: la saga con sus libros (planos) ordenados por su orden en la saga.
export const SagaDetailSchema = SagaSchema.extend({ books: z.array(BookSchema) });

export type SagaDetail = z.infer<typeof SagaDetailSchema>;

import { z } from 'zod';

// Los query params llegan como texto: `z.coerce` los convierte a número antes de validar.
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

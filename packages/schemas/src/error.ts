import { z } from 'zod';

// Forma por defecto de los errores de Fastify: todas las rutas documentan
// sus 4xx con este esquema y la web lee `message`.
export const ErrorResponseSchema = z.object({
  statusCode: z.number().int(),
  code: z.string().optional(), // p. ej. FST_ERR_VALIDATION
  error: z.string(), // "Bad Request"
  message: z.string(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

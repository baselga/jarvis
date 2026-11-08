import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  db: z.enum(['up', 'down']),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

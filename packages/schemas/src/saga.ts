import { z } from 'zod';

export const SagaNameSchema = z.string().trim().min(1).max(200);

// Sin distinguir mayúsculas, el nombre no se puede repetir (lo garantiza la BD).
export const SagaSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export type Saga = z.infer<typeof SagaSchema>;

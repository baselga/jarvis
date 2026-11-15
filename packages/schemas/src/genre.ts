import { z } from 'zod';

export const GenreNameSchema = z.string().trim().min(1).max(200);

// Sin distinguir mayúsculas, el nombre no se puede repetir (lo garantiza la BD).
export const GenreSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export type Genre = z.infer<typeof GenreSchema>;

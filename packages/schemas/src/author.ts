import { z } from 'zod';

export const AuthorNameSchema = z.string().trim().min(1).max(200);

// Sin distinguir mayúsculas, el nombre no se puede repetir (lo garantiza la BD).
export const AuthorSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export type Author = z.infer<typeof AuthorSchema>;

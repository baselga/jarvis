import { z } from 'zod';
import { DateSchema } from './date.js';

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

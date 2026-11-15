import { z } from 'zod';

export const BookTitleSchema = z.string().trim().min(1).max(300);

export const SagaOrderSchema = z.number().min(0).max(9999.9).multipleOf(0.1);

// Se guarda sin guiones ni espacios y en mayúsculas (la X final del ISBN-10).
// No se valida el dígito de control: sería demasiado estricto para ediciones antiguas.
export const IsbnSchema = z
  .string()
  .transform((value) => value.replace(/[-\s]/g, '').toUpperCase())
  .pipe(z.string().regex(/^(\d{9}[\dX]|\d{13})$/, 'ISBN de 10 o 13 caracteres'));

export const BookYearSchema = z.int().min(0).max(2100);

// Código ISO 639-1 de dos letras en minúsculas ("es", "en").
export const LanguageSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().regex(/^[a-z]{2}$/, 'Código de idioma de dos letras'));

export const BookLocationSchema = z.string().trim().min(1).max(200);

export const BookNotesSchema = z.string().trim().min(1).max(2000);

// Libro plano, sin autores ni géneros embebidos. Los opcionales son `null`, no ausentes.
export const BookSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  sagaId: z.uuid().nullable(),
  sagaOrder: z.number().nullable(),
  isbn: z.string().nullable(),
  year: z.number().nullable(),
  language: z.string().nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
});

export type Book = z.infer<typeof BookSchema>;

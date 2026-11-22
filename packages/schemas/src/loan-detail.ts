import { z } from 'zod';

import { BookDetailSchema } from './book-detail.js';
import { DateSchema } from './date.js';
import { BorrowerSchema, LoanSchema } from './loan.js';

// Vive aparte de `loan.ts` porque `ActiveLoanSchema` necesita `BookDetailSchema`, y
// `book-detail.ts` ya importa `loan.ts`: juntarlos crearía un ciclo de importación.

export const LoanIdParamsSchema = z.object({ id: z.uuid() });

export type LoanIdParams = z.infer<typeof LoanIdParamsSchema>;

// Sin `loanedAt`, la API usa hoy en la zona de casa (`HOME_TZ`).
export const CreateLoanRequestSchema = z.object({
  borrower: BorrowerSchema,
  loanedAt: DateSchema.optional(),
});

export type CreateLoanRequest = z.infer<typeof CreateLoanRequestSchema>;

// Sin `returnedAt` (o sin cuerpo), la API usa hoy en la zona de casa (`HOME_TZ`).
// `.nullish()` y no `.optional()`: Fastify valida un cuerpo ausente como `null`.
export const ReturnLoanRequestSchema = z.object({ returnedAt: DateSchema.optional() }).nullish();

export type ReturnLoanRequest = z.infer<typeof ReturnLoanRequestSchema>;

// Corrección de un préstamo: ausente = no tocar; `returnedAt: null` = vuelve a estar prestado.
// Estricto: el libro no se cambia, y enviar `bookId` da 400 en vez de ignorarse en silencio.
// Las reglas que dependen de lo guardado (devolución ≥ préstamo, un solo préstamo activo por
// libro) las comprueba la BD.
export const UpdateLoanRequestSchema = z
  .strictObject({
    borrower: BorrowerSchema.optional(),
    loanedAt: DateSchema.optional(),
    returnedAt: DateSchema.nullable().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Indica al menos un campo que cambiar',
  })
  .refine(
    (body) => body.loanedAt == null || body.returnedAt == null || body.returnedAt >= body.loanedAt,
    { message: 'La devolución no puede ser anterior al préstamo', path: ['returnedAt'] },
  );

export type UpdateLoanRequest = z.infer<typeof UpdateLoanRequestSchema>;

// Historial de un libro: del préstamo más reciente al más antiguo.
export const BookLoansResponseSchema = z.object({ loans: z.array(LoanSchema) });

export type BookLoansResponse = z.infer<typeof BookLoansResponseSchema>;

// Préstamo sin devolver con su libro completo. `book.activeLoan` repite el préstamo.
export const ActiveLoanSchema = LoanSchema.extend({ book: BookDetailSchema });

export type ActiveLoan = z.infer<typeof ActiveLoanSchema>;

// Libros fuera de casa: primero el que más tiempo lleva prestado.
export const ActiveLoansResponseSchema = z.object({ loans: z.array(ActiveLoanSchema) });

export type ActiveLoansResponse = z.infer<typeof ActiveLoansResponseSchema>;

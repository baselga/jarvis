import { z } from 'zod';

import { BookDetailSchema } from './book-detail.js';
import { DateSchema } from './date.js';
import { BorrowerSchema, LoanSchema } from './loan.js';

// Vive aparte de `loan.ts` porque `ActiveLoanSchema` necesita `BookDetailSchema`, y
// `book-detail.ts` ya importa `loan.ts`: juntarlos crearía un ciclo de importación.

export const LoanIdParamsSchema = z.object({ id: z.uuid() });

export type LoanIdParams = z.infer<typeof LoanIdParamsSchema>;

// Las fechas son obligatorias: la API no sabe qué día es en casa (zona horaria), el cliente sí.
export const CreateLoanRequestSchema = z.object({
  borrower: BorrowerSchema,
  loanedAt: DateSchema,
});

export type CreateLoanRequest = z.infer<typeof CreateLoanRequestSchema>;

export const ReturnLoanRequestSchema = z.object({ returnedAt: DateSchema });

export type ReturnLoanRequest = z.infer<typeof ReturnLoanRequestSchema>;

// Historial de un libro: del préstamo más reciente al más antiguo.
export const BookLoansResponseSchema = z.object({ loans: z.array(LoanSchema) });

export type BookLoansResponse = z.infer<typeof BookLoansResponseSchema>;

// Préstamo sin devolver con su libro completo. `book.activeLoan` repite el préstamo.
export const ActiveLoanSchema = LoanSchema.extend({ book: BookDetailSchema });

export type ActiveLoan = z.infer<typeof ActiveLoanSchema>;

// Libros fuera de casa: primero el que más tiempo lleva prestado.
export const ActiveLoansResponseSchema = z.object({ loans: z.array(ActiveLoanSchema) });

export type ActiveLoansResponse = z.infer<typeof ActiveLoansResponseSchema>;

import { z } from 'zod';

import { DateSchema } from './date.js';

export const BorrowerSchema = z.string().trim().min(1).max(100);

export const LoanSchema = z.object({
  id: z.uuid(),
  bookId: z.uuid(),
  borrower: z.string(),
  loanedAt: DateSchema,
  returnedAt: DateSchema.nullable(),
});

export type Loan = z.infer<typeof LoanSchema>;

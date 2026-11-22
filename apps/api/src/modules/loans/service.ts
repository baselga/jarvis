import type { ActiveLoan, CreateLoanRequest, Loan } from '@jarvis/schemas';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import type { DbOrTx } from '../../db/client.js';
import { isCheckViolation, isForeignKeyViolation, isUniqueViolation } from '../../db/errors.js';
import { books, loans } from '../../db/schema/index.js';
import { bookColumns, loanColumns, withRelations } from '../books/service.js';

export type CreateLoanResult =
  { status: 'ok'; loan: Loan } | { status: 'book_not_found' } | { status: 'already_loaned' };

export type ReturnLoanResult =
  | { status: 'ok'; loan: Loan }
  | { status: 'not_found' }
  | { status: 'already_returned' }
  | { status: 'returned_before_loaned' };

export type ListBookLoansResult = { status: 'ok'; loans: Loan[] } | { status: 'book_not_found' };

// No se consulta antes: el índice único parcial `loans_active_book_idx` impide un segundo
// préstamo activo y la clave foránea, un libro inexistente. Sin carreras entre peticiones.
export async function createLoan(
  db: DbOrTx,
  bookId: string,
  { borrower, loanedAt }: CreateLoanRequest,
): Promise<CreateLoanResult> {
  try {
    const [loan] = await db
      .insert(loans)
      .values({ bookId, borrower, loanedAt })
      .returning(loanColumns);
    return { status: 'ok', loan: loan! };
  } catch (error) {
    if (isUniqueViolation(error)) return { status: 'already_loaned' };
    if (isForeignKeyViolation(error)) return { status: 'book_not_found' };
    throw error;
  }
}

// `UPDATE` condicional: la condición de estado (`returned_at IS NULL`) va en el `WHERE`, así
// que si dos peticiones devuelven a la vez solo una cambia la fila. Si no cambia ninguna,
// una segunda consulta distingue «no existe» de «ya devuelto».
export async function returnLoan(
  db: DbOrTx,
  id: string,
  returnedAt: string,
): Promise<ReturnLoanResult> {
  try {
    const [loan] = await db
      .update(loans)
      .set({ returnedAt })
      .where(and(eq(loans.id, id), isNull(loans.returnedAt)))
      .returning(loanColumns);
    if (loan) return { status: 'ok', loan };
  } catch (error) {
    // `loans_returned_after_loaned`: Zod no conoce el `loanedAt` guardado.
    if (isCheckViolation(error)) return { status: 'returned_before_loaned' };
    throw error;
  }
  const [existing] = await db.select({ id: loans.id }).from(loans).where(eq(loans.id, id));
  return existing ? { status: 'already_returned' } : { status: 'not_found' };
}

// Se comprueba que el libro existe: la lista vacía no distingue «sin préstamos» de «no existe».
export async function listBookLoans(db: DbOrTx, bookId: string): Promise<ListBookLoansResult> {
  const [[book], rows] = await Promise.all([
    db.select({ id: books.id }).from(books).where(eq(books.id, bookId)),
    db
      .select(loanColumns)
      .from(loans)
      .where(eq(loans.bookId, bookId))
      // Dos el mismo día: va antes el último registrado. `id` desempata del todo.
      .orderBy(desc(loans.loanedAt), desc(loans.createdAt), loans.id),
  ]);
  return book ? { status: 'ok', loans: rows } : { status: 'book_not_found' };
}

// Sin paginar: en una casa serán pocos. Primero el que más tiempo lleva fuera.
// `JOIN` 1:1 (cada préstamo tiene un libro): no repite filas.
export async function listActiveLoans(db: DbOrTx): Promise<ActiveLoan[]> {
  const rows = await db
    .select({ loan: loanColumns, book: bookColumns })
    .from(loans)
    .innerJoin(books, eq(books.id, loans.bookId))
    .where(isNull(loans.returnedAt))
    .orderBy(asc(loans.loanedAt), asc(loans.createdAt), loans.id);
  const details = await withRelations(
    db,
    rows.map((row) => row.book),
  );
  return rows.map(({ loan }, i) => ({ ...loan, book: details[i]! }));
}

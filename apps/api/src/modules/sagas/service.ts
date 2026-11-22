import type { Saga, SagaDetail, SagaListQuery } from '@jarvis/schemas';
import { asc, count, eq, sql } from 'drizzle-orm';

import type { DbOrTx } from '../../db/client.js';
import { isForeignKeyViolation, isUniqueViolation } from '../../db/errors.js';
import { books, sagas } from '../../db/schema/index.js';
import { containsText } from '../../db/search.js';
import { bookColumns } from '../books/service.js';

const sagaColumns = { id: sagas.id, name: sagas.name };

// Resultados explícitos en vez de excepciones: la ruta los traduce a HTTP y TypeScript
// avisa si falta un caso. Los códigos de Postgres no salen de este archivo.
export type CreateSagaResult = { status: 'ok'; saga: Saga } | { status: 'name_taken' };

export type UpdateSagaResult =
  { status: 'ok'; saga: Saga } | { status: 'not_found' } | { status: 'name_taken' };

export type DeleteSagaResult = { status: 'ok' } | { status: 'not_found' } | { status: 'has_books' };

export async function listSagas(db: DbOrTx, { q, limit, offset }: SagaListQuery) {
  const where = q === undefined ? undefined : containsText(sagas.name, q);
  const [rows, [totalRow]] = await Promise.all([
    db
      .select(sagaColumns)
      .from(sagas)
      .where(where)
      // `id` desempata nombres que solo difieren en mayúsculas: sin él las páginas podrían solaparse.
      .orderBy(sagas.name, sagas.id)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(sagas).where(where),
  ]);
  return { sagas: rows, total: totalRow!.total };
}

async function getSagaFlat(db: DbOrTx, id: string): Promise<Saga | undefined> {
  const [saga] = await db.select(sagaColumns).from(sagas).where(eq(sagas.id, id));
  return saga;
}

// Dos consultas en vez de un JOIN: así la saga no se repite en cada fila de libro.
// Los libros sin orden van al final; título e id desempatan (p. ej. una edición ómnibus
// comparte orden con otros libros).
export async function getSaga(db: DbOrTx, id: string): Promise<SagaDetail | undefined> {
  const saga = await getSagaFlat(db, id);
  if (!saga) return undefined;
  const sagaBooks = await db
    .select(bookColumns)
    .from(books)
    .where(eq(books.sagaId, id))
    .orderBy(sql`${books.sagaOrder} asc nulls last`, asc(books.title), asc(books.id));
  return { ...saga, books: sagaBooks };
}

// En create, update y delete no se consulta antes: se escribe y se captura la violación
// de la BD. La restricción es la fuente de verdad y no hay carreras entre peticiones.
export async function createSaga(
  db: DbOrTx,
  { name }: { name: string },
): Promise<CreateSagaResult> {
  try {
    const [saga] = await db.insert(sagas).values({ name }).returning(sagaColumns);
    return { status: 'ok', saga: saga! };
  } catch (error) {
    if (isUniqueViolation(error)) return { status: 'name_taken' };
    throw error;
  }
}

export async function updateSaga(
  db: DbOrTx,
  id: string,
  { name }: { name: string },
): Promise<UpdateSagaResult> {
  try {
    const [saga] = await db
      .update(sagas)
      .set({ name })
      .where(eq(sagas.id, id))
      .returning(sagaColumns);
    return saga ? { status: 'ok', saga } : { status: 'not_found' };
  } catch (error) {
    if (isUniqueViolation(error)) return { status: 'name_taken' };
    throw error;
  }
}

export async function deleteSaga(db: DbOrTx, id: string): Promise<DeleteSagaResult> {
  try {
    const [deleted] = await db.delete(sagas).where(eq(sagas.id, id)).returning({ id: sagas.id });
    return deleted ? { status: 'ok' } : { status: 'not_found' };
  } catch (error) {
    if (isForeignKeyViolation(error)) return { status: 'has_books' };
    throw error;
  }
}

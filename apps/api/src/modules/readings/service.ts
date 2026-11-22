import type {
  CreateReadingRequest,
  Reading,
  ReadingListQuery,
  ReadingListResponse,
  UpdateReadingRequest,
} from '@jarvis/schemas';
import { and, count, desc, eq, sql } from 'drizzle-orm';

import type { DbOrTx } from '../../db/client.js';
import { constraintOf, isCheckViolation, isForeignKeyViolation } from '../../db/errors.js';
import { books, readings, users } from '../../db/schema/index.js';

export type CreateReadingResult = { status: 'ok'; reading: Reading } | { status: 'book_not_found' };

export type UpdateReadingResult =
  | { status: 'ok'; reading: Reading }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'no_date' }
  | { status: 'finished_before_started' };

export type DeleteReadingResult =
  { status: 'ok' } | { status: 'not_found' } | { status: 'forbidden' };

const readingColumns = {
  id: readings.id,
  bookId: readings.bookId,
  userId: readings.userId,
  startedAt: readings.startedAt,
  finishedAt: readings.finishedAt,
  rating: readings.rating,
  note: readings.note,
};

// Qué regla de fechas se incumple, según el `check` que saltó.
const dateRuleConstraints: Record<string, 'no_date' | 'finished_before_started'> = {
  readings_has_date: 'no_date',
  readings_finished_after_started: 'finished_before_started',
};

// La clave foránea a `books` detecta el libro inexistente: no se consulta antes.
export async function createReading(
  db: DbOrTx,
  bookId: string,
  userId: string,
  data: CreateReadingRequest,
): Promise<CreateReadingResult> {
  try {
    const [reading] = await db
      .insert(readings)
      .values({ ...data, bookId, userId })
      .returning(readingColumns);
    return { status: 'ok', reading: reading! };
  } catch (error) {
    if (isForeignKeyViolation(error)) return { status: 'book_not_found' };
    throw error;
  }
}

// Si no cambió ninguna fila: ¿no existe (404) o es de otro (403)? Revelar que existe no
// importa porque toda la casa puede ver las lecturas.
async function missingOrForbidden(db: DbOrTx, id: string) {
  const [existing] = await db.select({ id: readings.id }).from(readings).where(eq(readings.id, id));
  return existing ? ({ status: 'forbidden' } as const) : ({ status: 'not_found' } as const);
}

// Autorización por fila: `user_id = <yo>` va en el propio `WHERE`, así que una lectura ajena
// no se modifica nunca, ni por un error de código ni por una carrera entre peticiones.
// Las reglas de fechas dependen de lo guardado: las detectan los `check` de la BD.
export async function updateReading(
  db: DbOrTx,
  id: string,
  userId: string,
  data: UpdateReadingRequest,
): Promise<UpdateReadingResult> {
  try {
    const [reading] = await db
      .update(readings)
      .set(data)
      .where(and(eq(readings.id, id), eq(readings.userId, userId)))
      .returning(readingColumns);
    if (reading) return { status: 'ok', reading };
  } catch (error) {
    const rule = isCheckViolation(error)
      ? dateRuleConstraints[constraintOf(error) ?? '']
      : undefined;
    if (rule) return { status: rule };
    throw error;
  }
  return missingOrForbidden(db, id);
}

export async function deleteReading(
  db: DbOrTx,
  id: string,
  userId: string,
): Promise<DeleteReadingResult> {
  const [deleted] = await db
    .delete(readings)
    .where(and(eq(readings.id, id), eq(readings.userId, userId)))
    .returning({ id: readings.id });
  return deleted ? { status: 'ok' } : missingOrForbidden(db, id);
}

// `JOIN` 1:1 (cada lectura tiene un usuario y un libro): no repite filas ni infla `total`.
// Incluye las lecturas de usuarios desactivados: siguen siendo historia de la casa.
export async function listReadings(
  db: DbOrTx,
  { bookId, userId, limit, offset }: ReadingListQuery,
): Promise<ReadingListResponse> {
  const where = and(
    bookId === undefined ? undefined : eq(readings.bookId, bookId),
    userId === undefined ? undefined : eq(readings.userId, userId),
  );
  const [readingRows, [totalRow]] = await Promise.all([
    db
      .select({
        ...readingColumns,
        user: { id: users.id, name: users.name },
        book: { id: books.id, title: books.title },
      })
      .from(readings)
      .innerJoin(users, eq(users.id, readings.userId))
      .innerJoin(books, eq(books.id, readings.bookId))
      .where(where)
      // Primero las que están «leyendo» (sin fin), luego la última terminada.
      .orderBy(
        sql`${readings.finishedAt} desc nulls first`,
        sql`${readings.startedAt} desc nulls last`,
        desc(readings.createdAt),
        readings.id,
      )
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(readings).where(where),
  ]);
  return { readings: readingRows, total: totalRow!.total };
}

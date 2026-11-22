import type { Genre, GenreListQuery } from '@jarvis/schemas';
import { count, eq, ilike } from 'drizzle-orm';

import type { DbOrTx } from '../../db/client.js';
import { isForeignKeyViolation, isUniqueViolation } from '../../db/errors.js';
import { genres } from '../../db/schema/index.js';
import { containsPattern } from '../../db/search.js';

const genreColumns = { id: genres.id, name: genres.name };

// Resultados explícitos en vez de excepciones: la ruta los traduce a HTTP y TypeScript
// avisa si falta un caso. Los códigos de Postgres no salen de este archivo.
export type CreateGenreResult = { status: 'ok'; genre: Genre } | { status: 'name_taken' };

export type UpdateGenreResult =
  { status: 'ok'; genre: Genre } | { status: 'not_found' } | { status: 'name_taken' };

export type DeleteGenreResult =
  { status: 'ok' } | { status: 'not_found' } | { status: 'has_books' };

export async function listGenres(db: DbOrTx, { q, limit, offset }: GenreListQuery) {
  const where = q === undefined ? undefined : ilike(genres.name, containsPattern(q));
  const [rows, [totalRow]] = await Promise.all([
    db
      .select(genreColumns)
      .from(genres)
      .where(where)
      // `id` desempata nombres que solo difieren en mayúsculas: sin él las páginas podrían solaparse.
      .orderBy(genres.name, genres.id)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(genres).where(where),
  ]);
  return { genres: rows, total: totalRow!.total };
}

export async function getGenre(db: DbOrTx, id: string): Promise<Genre | undefined> {
  const [genre] = await db.select(genreColumns).from(genres).where(eq(genres.id, id));
  return genre;
}

// En create, update y delete no se consulta antes: se escribe y se captura la violación
// de la BD. La restricción es la fuente de verdad y no hay carreras entre peticiones.
export async function createGenre(
  db: DbOrTx,
  { name }: { name: string },
): Promise<CreateGenreResult> {
  try {
    const [genre] = await db.insert(genres).values({ name }).returning(genreColumns);
    return { status: 'ok', genre: genre! };
  } catch (error) {
    if (isUniqueViolation(error)) return { status: 'name_taken' };
    throw error;
  }
}

export async function updateGenre(
  db: DbOrTx,
  id: string,
  { name }: { name: string },
): Promise<UpdateGenreResult> {
  try {
    const [genre] = await db
      .update(genres)
      .set({ name })
      .where(eq(genres.id, id))
      .returning(genreColumns);
    return genre ? { status: 'ok', genre } : { status: 'not_found' };
  } catch (error) {
    if (isUniqueViolation(error)) return { status: 'name_taken' };
    throw error;
  }
}

export async function deleteGenre(db: DbOrTx, id: string): Promise<DeleteGenreResult> {
  try {
    const [deleted] = await db.delete(genres).where(eq(genres.id, id)).returning({ id: genres.id });
    return deleted ? { status: 'ok' } : { status: 'not_found' };
  } catch (error) {
    if (isForeignKeyViolation(error)) return { status: 'has_books' };
    throw error;
  }
}

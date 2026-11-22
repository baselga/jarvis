import type { Author, AuthorListQuery } from '@jarvis/schemas';
import { count, eq, ilike } from 'drizzle-orm';

import type { DbOrTx } from '../../db/client.js';
import { isForeignKeyViolation, isUniqueViolation } from '../../db/errors.js';
import { authors } from '../../db/schema/index.js';
import { containsPattern } from '../../db/search.js';

const authorColumns = { id: authors.id, name: authors.name };

// Resultados explícitos en vez de excepciones: la ruta los traduce a HTTP y TypeScript
// avisa si falta un caso. Los códigos de Postgres no salen de este archivo.
export type CreateAuthorResult = { status: 'ok'; author: Author } | { status: 'name_taken' };

export type UpdateAuthorResult =
  { status: 'ok'; author: Author } | { status: 'not_found' } | { status: 'name_taken' };

export type DeleteAuthorResult =
  { status: 'ok' } | { status: 'not_found' } | { status: 'has_books' };

export async function listAuthors(db: DbOrTx, { q, limit, offset }: AuthorListQuery) {
  const where = q === undefined ? undefined : ilike(authors.name, containsPattern(q));
  const [rows, [totalRow]] = await Promise.all([
    db
      .select(authorColumns)
      .from(authors)
      .where(where)
      // `id` desempata nombres que solo difieren en mayúsculas: sin él las páginas podrían solaparse.
      .orderBy(authors.name, authors.id)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(authors).where(where),
  ]);
  return { authors: rows, total: totalRow!.total };
}

export async function getAuthor(db: DbOrTx, id: string): Promise<Author | undefined> {
  const [author] = await db.select(authorColumns).from(authors).where(eq(authors.id, id));
  return author;
}

// En create, update y delete no se consulta antes: se escribe y se captura la violación
// de la BD. La restricción es la fuente de verdad y no hay carreras entre peticiones.
export async function createAuthor(
  db: DbOrTx,
  { name }: { name: string },
): Promise<CreateAuthorResult> {
  try {
    const [author] = await db.insert(authors).values({ name }).returning(authorColumns);
    return { status: 'ok', author: author! };
  } catch (error) {
    if (isUniqueViolation(error)) return { status: 'name_taken' };
    throw error;
  }
}

export async function updateAuthor(
  db: DbOrTx,
  id: string,
  { name }: { name: string },
): Promise<UpdateAuthorResult> {
  try {
    const [author] = await db
      .update(authors)
      .set({ name })
      .where(eq(authors.id, id))
      .returning(authorColumns);
    return author ? { status: 'ok', author } : { status: 'not_found' };
  } catch (error) {
    if (isUniqueViolation(error)) return { status: 'name_taken' };
    throw error;
  }
}

export async function deleteAuthor(db: DbOrTx, id: string): Promise<DeleteAuthorResult> {
  try {
    const [deleted] = await db
      .delete(authors)
      .where(eq(authors.id, id))
      .returning({ id: authors.id });
    return deleted ? { status: 'ok' } : { status: 'not_found' };
  } catch (error) {
    if (isForeignKeyViolation(error)) return { status: 'has_books' };
    throw error;
  }
}

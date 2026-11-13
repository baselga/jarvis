import { hashPassword } from '../auth/password.js';
import type { Db } from './client.js';
import { users } from './schema/index.js';

// Crea el primer admin si no existe ningún usuario con ese email. Nunca modifica
// uno existente: se puede relanzar sin pisar una contraseña cambiada desde la web.
export async function seedAdmin(
  db: Db,
  { name, email, password }: { name: string; email: string; password: string },
): Promise<'created' | 'exists'> {
  // `on conflict do nothing` es atómico: no hay carrera entre comprobar e insertar.
  const inserted = await db
    .insert(users)
    .values({
      name,
      email: email.trim().toLowerCase(),
      passwordHash: await hashPassword(password),
      role: 'admin',
      active: true,
    })
    .onConflictDoNothing({ target: users.email })
    .returning();
  return inserted.length > 0 ? 'created' : 'exists';
}

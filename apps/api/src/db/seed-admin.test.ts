import { describe, expect, it } from 'vitest';
import { verifyPassword } from '../auth/password.js';
import { createUser, testDb } from '../test/helpers.js';
import { users } from './schema/index.js';
import { seedAdmin } from './seed-admin.js';

const admin = { name: 'Admin', email: ' Admin@Casa.Local ', password: 'correcta-123' };

describe('seedAdmin', () => {
  it('con la BD vacía crea un admin activo, con email en minúsculas y contraseña verificable', async () => {
    expect(await seedAdmin(testDb, admin)).toBe('created');

    const [user] = await testDb.select().from(users);
    expect(user).toMatchObject({
      name: 'Admin',
      email: 'admin@casa.local',
      role: 'admin',
      active: true,
    });
    expect(await verifyPassword(user!.passwordHash, 'correcta-123')).toBe(true);
  });

  it('relanzado con los mismos datos devuelve exists y no duplica', async () => {
    await seedAdmin(testDb, admin);

    expect(await seedAdmin(testDb, admin)).toBe('exists');
    expect(await testDb.select().from(users)).toHaveLength(1);
  });

  it('con un email ya existente no modifica el usuario', async () => {
    const existing = await createUser({
      name: 'Ana',
      email: 'admin@casa.local',
      role: 'adult',
      password: 'otra-clave-456',
    });

    expect(await seedAdmin(testDb, admin)).toBe('exists');

    const [user] = await testDb.select().from(users);
    expect(user).toMatchObject({
      name: 'Ana',
      role: 'adult',
      passwordHash: existing.passwordHash,
    });
  });
});

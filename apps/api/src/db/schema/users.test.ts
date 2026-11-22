import { describe, expect, it } from 'vitest';

import { expectPgCode, testDb } from '../../test/helpers.js';
import { users } from './users.js';

// Código de Postgres `check_violation`.
const CHECK_VIOLATION = '23514';

function insertUser(email: string) {
  return testDb
    .insert(users)
    .values({ name: 'Ana', email, passwordHash: 'not-a-hash', role: 'adult' })
    .returning();
}

describe('users.email en minúsculas', () => {
  it('un email con mayúsculas falla el CHECK', async () => {
    await expectPgCode(insertUser('Ana@Test.local'), CHECK_VIOLATION);
  });

  it('un email en minúsculas se crea', async () => {
    const [user] = await insertUser('ana@test.local');

    expect(user!.email).toBe('ana@test.local');
  });
});

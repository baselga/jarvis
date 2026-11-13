import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('hashPassword', () => {
  it('devuelve un hash argon2id distinto de la contraseña', async () => {
    const hash = await hashPassword('correcta-123');

    expect(hash).not.toBe('correcta-123');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('da hashes distintos para la misma contraseña (salt aleatoria)', async () => {
    const [a, b] = await Promise.all([hashPassword('correcta-123'), hashPassword('correcta-123')]);

    expect(a).not.toBe(b);
  });
});

describe('verifyPassword', () => {
  it('acepta la contraseña correcta', async () => {
    const hash = await hashPassword('correcta-123');

    expect(await verifyPassword(hash, 'correcta-123')).toBe(true);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const hash = await hashPassword('correcta-123');

    expect(await verifyPassword(hash, 'incorrecta-123')).toBe(false);
  });

  it('devuelve false con un hash malformado, sin lanzar', async () => {
    await expect(verifyPassword('not-a-hash', 'correcta-123')).resolves.toBe(false);
  });
});

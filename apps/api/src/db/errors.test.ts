import { describe, expect, it } from 'vitest';
import { isForeignKeyViolation, isUniqueViolation } from './errors.js';

// Como los de Drizzle 0.45: un `Error` cuyo `cause` lleva el código de Postgres.
const wrapped = (code: string) => new Error('Failed query', { cause: { code } });

describe('isUniqueViolation', () => {
  it('detecta 23505 directo y en cause', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation(wrapped('23505'))).toBe(true);
  });

  it('otro código o un valor que no es error → false', () => {
    expect(isUniqueViolation(wrapped('23503'))).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});

describe('isForeignKeyViolation', () => {
  it('detecta 23001 (RESTRICT) y 23503 (id inexistente)', () => {
    expect(isForeignKeyViolation({ code: '23001' })).toBe(true);
    expect(isForeignKeyViolation({ code: '23503' })).toBe(true);
  });

  it('los detecta también en cause', () => {
    expect(isForeignKeyViolation(wrapped('23001'))).toBe(true);
    expect(isForeignKeyViolation(wrapped('23503'))).toBe(true);
  });

  it('otro código o un valor que no es error → false', () => {
    expect(isForeignKeyViolation({ code: '23505' })).toBe(false);
    expect(isForeignKeyViolation(wrapped('23505'))).toBe(false);
    expect(isForeignKeyViolation(null)).toBe(false);
  });
});

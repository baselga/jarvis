import { describe, expect, it } from 'vitest';

import {
  constraintOf,
  isCheckViolation,
  isDbUnavailable,
  isForeignKeyViolation,
  isUniqueViolation,
} from './errors.js';

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

describe('isCheckViolation', () => {
  it('detecta 23514 directo y en cause', () => {
    expect(isCheckViolation({ code: '23514' })).toBe(true);
    expect(isCheckViolation(wrapped('23514'))).toBe(true);
  });

  it('otro código o un valor que no es error → false', () => {
    expect(isCheckViolation(wrapped('23505'))).toBe(false);
    expect(isCheckViolation(undefined)).toBe(false);
  });
});

describe('isDbUnavailable', () => {
  const codes = ['ECONNREFUSED', 'CONNECTION_ENDED', '08006', '57P01'];

  it('detecta red, cliente y SQLSTATE de conexión, directos y en cause', () => {
    for (const code of codes) {
      expect(isDbUnavailable({ code })).toBe(true);
      expect(isDbUnavailable(wrapped(code))).toBe(true);
    }
  });

  it('un error de consulta, un Error sin código o undefined → false', () => {
    expect(isDbUnavailable(wrapped('23505'))).toBe(false);
    expect(isDbUnavailable(new Error('sin código'))).toBe(false);
    expect(isDbUnavailable(undefined)).toBe(false);
  });
});

describe('constraintOf', () => {
  it('lee constraint_name directo y en cause', () => {
    expect(constraintOf({ constraint_name: 'a_fk' })).toBe('a_fk');
    expect(constraintOf(new Error('Failed query', { cause: { constraint_name: 'b_fk' } }))).toBe(
      'b_fk',
    );
  });

  it('sin nombre de restricción → undefined', () => {
    expect(constraintOf(wrapped('23503'))).toBeUndefined();
    expect(constraintOf(null)).toBeUndefined();
  });
});

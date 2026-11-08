import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const DATABASE_URL = 'postgres://jarvis:jarvis@localhost:5432/jarvis';

describe('loadConfig', () => {
  it('aplica valores por defecto', () => {
    expect(loadConfig({ DATABASE_URL })).toMatchObject({
      PORT: 3000,
      HOST: '0.0.0.0',
      LOG_LEVEL: 'info',
    });
  });

  it('falla si una variable tiene un valor inválido', () => {
    expect(() => loadConfig({ DATABASE_URL, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('falla si falta DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});

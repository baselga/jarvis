import { HealthResponseSchema } from '@jarvis/schemas';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../app.js';
import type { Db } from '../../db/client.js';

// Solo /health usa la BD y solo llama a `execute`, así que basta con simular eso.
function fakeDb(execute: () => Promise<unknown>) {
  return { execute: vi.fn(execute) } as unknown as Db;
}

describe('GET /health', () => {
  it('responde 200 con la BD disponible', async () => {
    const app = buildApp({ db: fakeDb(() => Promise.resolve([])) });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(HealthResponseSchema.parse(res.json())).toEqual({ status: 'ok', db: 'up' });
    await app.close();
  });

  it('responde 503 con la BD caída', async () => {
    const app = buildApp({ db: fakeDb(() => Promise.reject(new Error('ECONNREFUSED'))) });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(503);
    expect(HealthResponseSchema.parse(res.json())).toEqual({ status: 'error', db: 'down' });
    await app.close();
  });
});

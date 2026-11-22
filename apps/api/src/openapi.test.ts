import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import type { Db } from './db/client.js';

// La documentación no consulta la BD.
const db = {} as Db;

// Lo mínimo del documento OpenAPI que comprueban los tests.
interface OpenApiDoc {
  openapi: string;
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
}

describe('OpenAPI', () => {
  it('GET /docs/json devuelve el documento con /health', async () => {
    const app = buildApp({ db });

    const res = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(res.statusCode).toBe(200);
    const doc = res.json<OpenApiDoc>();
    expect(doc.openapi).toMatch(/^3\./);
    expect(Object.keys(doc.paths['/health']?.get?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '503']),
    );
    await app.close();
  });

  it('GET /docs sirve Swagger UI en HTML', async () => {
    const app = buildApp({ db });

    const res = await app.inject({ method: 'GET', url: '/docs' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    await app.close();
  });
});

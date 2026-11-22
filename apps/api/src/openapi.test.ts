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

  it('documenta el 503 en todas las rutas sin pisar el de /health', async () => {
    const app = buildApp({ db });

    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json<OpenApiDoc>();

    expect(doc.paths['/authors']?.get?.responses).toHaveProperty('503');
    // El de `/health` es `HealthResponseSchema` (con `db`), no el genérico de error.
    expect(JSON.stringify(doc.paths['/health']?.get?.responses['503'])).toContain('"db"');
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

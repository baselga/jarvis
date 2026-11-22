import { ErrorResponseSchema } from '@jarvis/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import { createDb } from './db/client.js';
import { buildTestApp } from './test/helpers.js';

describe('manejador de errores global', () => {
  describe('con la BD caída', () => {
    // Puerto cerrado: `postgres` lanza el error real de conexión al instante.
    const down = createDb('postgres://jarvis:x@127.0.0.1:1/jarvis');
    const app = buildApp({ db: down.db });

    afterAll(async () => {
      await app.close();
      await down.close();
    });

    const unavailable = {
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'La base de datos no está disponible',
    };

    it('una ruta protegida responde 503 (no 500 desde authenticate)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: 'Bearer x' },
      });

      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual(unavailable);
    });

    it('una ruta pública responde 503', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'ana@test.local', password: 'una-contraseña' },
      });

      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual(unavailable);
    });
  });

  describe('con la BD disponible', () => {
    const app = buildTestApp();

    beforeAll(async () => {
      app.get('/boom', () => {
        throw new Error('detalle interno');
      });
      // Lo que emite Node si el cliente corta la subida del cuerpo (Fastify le pone el 400).
      app.get('/aborted', () => {
        throw Object.assign(new Error('aborted'), { code: 'ECONNRESET', statusCode: 400 });
      });
      // Errores con `status` en vez de `statusCode`, como los de `http-errors`.
      app.get('/status-404', () => {
        throw Object.assign(new Error('No existe'), { status: 404 });
      });
      await app.ready();
    });

    afterAll(() => app.close());

    it('un error inesperado responde 500 genérico, sin el detalle', async () => {
      const res = await app.inject({ method: 'GET', url: '/boom' });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Error interno',
      });
      expect(res.body).not.toContain('detalle interno');
    });

    it('un 4xx con código de red (cuerpo cortado) sigue siendo 4xx, no 503', async () => {
      const res = await app.inject({ method: 'GET', url: '/aborted' });

      expect(res.statusCode).toBe(400);
    });

    it('un error con `status` 4xx (sin `statusCode`) se respeta, no es 500', async () => {
      const res = await app.inject({ method: 'GET', url: '/status-404' });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ statusCode: 404, message: 'No existe' });
    });

    it('un cuerpo inválido sigue respondiendo el 400 de validación de Fastify', async () => {
      const res = await app.inject({ method: 'POST', url: '/auth/login', payload: {} });

      expect(res.statusCode).toBe(400);
      const body = ErrorResponseSchema.parse(res.json());
      expect(body).toMatchObject({ code: 'FST_ERR_VALIDATION', error: 'Bad Request' });
      expect(body.message).toMatch(/^body\//);
    });
  });
});

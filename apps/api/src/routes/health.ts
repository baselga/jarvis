import { HealthResponseSchema } from '@jarvis/schemas';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['sistema'],
        summary: 'Estado de la API y de la BD',
        response: { 200: HealthResponseSchema, 503: HealthResponseSchema },
      },
    },
    async (request, reply) => {
      try {
        await app.db.execute(sql`select 1`);
        // `as const`: el otro camino devuelve `reply` y TS ensancharía 'ok' a string.
        return { status: 'ok', db: 'up' } as const;
      } catch (err) {
        // 503 (no 500): la API funciona, pero un servicio del que depende no.
        request.log.error({ err }, 'La BD no responde');
        return reply.code(503).send({ status: 'error', db: 'down' });
      }
    },
  );
};

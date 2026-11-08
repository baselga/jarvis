import type { HealthResponse } from '@jarvis/schemas';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

export function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (request, reply): Promise<HealthResponse> => {
    try {
      await app.db.execute(sql`select 1`);
      return { status: 'ok', db: 'up' };
    } catch (err) {
      // 503 (no 500): la API funciona, pero un servicio del que depende no.
      request.log.error({ err }, 'La BD no responde');
      return reply.code(503).send({ status: 'error', db: 'down' });
    }
  });
}

import Fastify, { type FastifyServerOptions } from 'fastify';
import type { Db } from './db/client.js';
import { healthRoutes } from './routes/health.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

export interface BuildAppOptions {
  logger?: FastifyServerOptions['logger'];
  db: Db;
}

// Construye la app sin arrancar el servidor: los tests la usan con `inject()`
// y `server.ts` la pone a escuchar en un puerto. La BD se recibe desde fuera
// para que los tests puedan pasar una simulada.
export function buildApp({ logger = false, db }: BuildAppOptions) {
  const app = Fastify({ logger });
  app.decorate('db', db);
  app.register(healthRoutes);
  return app;
}

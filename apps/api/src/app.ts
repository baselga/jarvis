import Fastify, { type FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Db } from './db/client.js';
import { registerOpenApi } from './openapi.js';
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
  // Los esquemas Zod de cada ruta validan la entrada y también la respuesta.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('db', db);
  registerOpenApi(app);
  app.register(healthRoutes);
  return app;
}

import cookie from '@fastify/cookie';
import type { DateString } from '@jarvis/schemas';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

import { authPlugin } from './auth/authenticate.js';
import { DEFAULT_HOME_TZ, todayIn } from './dates.js';
import type { Db } from './db/client.js';
import { errorHandler } from './error-handler.js';
import { authRoutes } from './modules/auth/routes.js';
import { authorRoutes } from './modules/authors/routes.js';
import { bookRoutes } from './modules/books/routes.js';
import { genreRoutes } from './modules/genres/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { loanRoutes } from './modules/loans/routes.js';
import { readingRoutes } from './modules/readings/routes.js';
import { sagaRoutes } from './modules/sagas/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { registerOpenApi } from './openapi.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    // Hoy en la zona de casa (`HOME_TZ`), para las fechas por defecto.
    today(): DateString;
  }
}

export interface BuildAppOptions {
  logger?: FastifyServerOptions['logger'];
  db: Db;
  // Cookie de sesión solo por HTTPS; `server.ts` la activa en producción.
  cookieSecure?: boolean;
  // Zona IANA de casa (`HOME_TZ`); los tests la eligen sin tocar el entorno.
  homeTimeZone?: string;
}

// Construye la app sin arrancar el servidor: los tests la usan con `inject()`
// y `server.ts` la pone a escuchar en un puerto. La BD se recibe desde fuera
// para que los tests puedan pasar una simulada.
export function buildApp({
  logger = false,
  db,
  cookieSecure = false,
  homeTimeZone = DEFAULT_HOME_TZ,
}: BuildAppOptions) {
  const app = Fastify({ logger });
  // Los esquemas Zod de cada ruta validan la entrada y también la respuesta.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('db', db);
  app.decorate('today', () => todayIn(homeTimeZone));
  // Antes que plugins y rutas: lo heredan todos por encapsulación.
  app.setErrorHandler(errorHandler);
  // Muchos clientes envían `Content-Type: application/json` siempre, también en
  // un POST sin cuerpo (logout); Fastify lo rechaza con 400. Aquí el cuerpo vacío
  // es `undefined` y el resto lo parsea el de Fastify (con su protección de `__proto__`).
  const defaultJsonParser = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    // Con `parseAs: 'string'` siempre llega un string, pero el tipo admite Buffer.
    const text = body.toString();
    if (text === '') {
      done(null, undefined);
      return;
    }
    // Su tipo admite devolver una promesa, pero el de JSON responde por `done`.
    void defaultJsonParser(request, text, done);
  });
  registerOpenApi(app);
  app.register(cookie);
  app.register(authPlugin, { cookieSecure });
  app.register(healthRoutes);
  app.register(authRoutes, { cookieSecure });
  app.register(userRoutes);
  app.register(authorRoutes);
  app.register(genreRoutes);
  app.register(sagaRoutes);
  app.register(bookRoutes);
  app.register(loanRoutes);
  app.register(readingRoutes);
  return app;
}

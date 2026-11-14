import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { SESSION_COOKIE } from './auth/request-token.js';

// Documentación OpenAPI generada desde los esquemas Zod de las rutas.
// Debe registrarse antes que las rutas: @fastify/swagger las descubre con `onRoute`.
export function registerOpenApi(app: FastifyInstance) {
  app.register(swagger, {
    openapi: {
      info: { title: 'Jarvis API', version: '0.0.0' },
      // Las dos formas de enviar la sesión: Bearer (asistente) y cookie (web).
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
          cookieAuth: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  // Página interactiva en /docs; el documento JSON, en /docs/json.
  app.register(swaggerUi, { routePrefix: '/docs' });
}

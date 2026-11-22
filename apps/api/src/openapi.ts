import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ErrorResponseSchema } from '@jarvis/schemas';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

import { SESSION_COOKIE } from './auth/request-token.js';

// El 503 (BD caída) lo pone el manejador global en cualquier ruta, así que se documenta aquí
// y no en cada una. Si la ruta declara el suyo (`/health`), gana el de la ruta.
// Solo cambia la documentación: la serialización usa el `schema` original.
const transform: typeof jsonSchemaTransform = ({ schema, ...rest }) => {
  // El tipo dice que siempre hay `schema`, pero swagger pasa `route.schema` tal cual: en una
  // ruta sin `schema` llega `undefined`.
  if (!schema) return jsonSchemaTransform({ schema, ...rest });
  const response = { 503: ErrorResponseSchema, ...(schema.response as object | undefined) };
  return jsonSchemaTransform({ ...rest, schema: { ...schema, response } });
};

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
    transform,
  });
  // Página interactiva en /docs; el documento JSON, en /docs/json.
  app.register(swaggerUi, { routePrefix: '/docs' });
}

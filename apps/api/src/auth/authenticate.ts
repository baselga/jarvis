import { type AuthUser, ErrorResponseSchema, type Role } from '@jarvis/schemas';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import { SESSION_COOKIE, getRequestToken, sessionCookieOptions } from './request-token.js';
import { validateSession } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    // Sin `| null`: solo se lee en rutas protegidas, tras `authenticate`.
    user: AuthUser;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  cookieSecure: boolean;
}

// Cualquiera de los dos esquemas de `openapi.ts` sirve (Bearer o cookie).
export const sessionSecurity: Record<string, string[]>[] = [{ bearerAuth: [] }, { cookieAuth: [] }];

// Para `response: { 200: X, ...authErrorResponses }`. Una ruta con `authenticate`
// pero sin `requireRole` puede declarar solo el 401.
export const authErrorResponses = { 401: ErrorResponseSchema, 403: ErrorResponseSchema };

// `fastify-plugin` saca el decorador del contexto de este plugin: así
// `app.authenticate` existe en toda la app, no solo aquí dentro.
export const authPlugin = fp<AuthPluginOptions>(
  (app, { cookieSecure }, done) => {
    const cookieOptions = sessionCookieOptions(cookieSecure);
    // Fastify pide declarar de antemano las propiedades de la request (forma estable
    // del objeto); el valor real lo pone `authenticate`.
    app.decorateRequest('user', null as unknown as AuthUser);

    // 401 = no sé quién eres. Al responder aquí, la petición no llega al handler.
    app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
      const requestToken = getRequestToken(request);
      const session = requestToken && (await validateSession(app.db, requestToken.token));
      if (!session) {
        return reply
          .code(401)
          .send({ statusCode: 401, error: 'Unauthorized', message: 'No autenticado' });
      }

      // Sesión deslizante: al renovar, el navegador necesita la cookie con el nuevo
      // Max-Age; el Bearer no.
      if (session.renewed && requestToken.source === 'cookie') {
        reply.setCookie(SESSION_COOKIE, requestToken.token, cookieOptions);
      }
      request.user = session.user;
    });
    done();
  },
  { name: 'auth', dependencies: ['@fastify/cookie'] },
);

// 403 = sé quién eres y no puedes. Lista explícita, sin jerarquía de roles.
// Va en `preHandler`, que corre después del `onRequest` de `authenticate`.
export function requireRole(...roles: Role[]): preHandlerAsyncHookHandler {
  return async (request, reply) => {
    if (!roles.includes(request.user.role)) {
      return reply
        .code(403)
        .send({ statusCode: 403, error: 'Forbidden', message: 'No tienes permiso' });
    }
  };
}

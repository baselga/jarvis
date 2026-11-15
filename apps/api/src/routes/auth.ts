import {
  ChangePasswordRequestSchema,
  ErrorResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  MeResponseSchema,
} from '@jarvis/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authErrorResponses, requireRole, sessionSecurity } from '../auth/authenticate.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { SESSION_COOKIE, getRequestToken, sessionCookieOptions } from '../auth/request-token.js';
import { createSession, deleteSession, deleteUserSessions } from '../auth/session.js';
import { users } from '../db/schema/index.js';

export interface AuthRoutesOptions {
  cookieSecure: boolean;
}

// Hash de relleno para verificar aunque el email no exista: así el login tarda
// lo mismo y el tiempo de respuesta no delata qué emails están registrados.
// Se calcula una sola vez, en el primer login.
let dummyHash: Promise<string> | undefined;
function getDummyHash() {
  dummyHash ??= hashPassword('contraseña-de-relleno');
  return dummyHash;
}

const unauthorized = (message: string) =>
  ({ statusCode: 401, error: 'Unauthorized', message }) as const;

// 400 y no 401: la sesión es válida, y la web trata todo 401 como «sesión caducada».
const wrongCurrentPassword = {
  statusCode: 400,
  error: 'Bad Request',
  message: 'La contraseña actual no es correcta',
} as const;

export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (
  app,
  { cookieSecure },
) => {
  const cookieOptions = sessionCookieOptions(cookieSecure);

  app.post(
    '/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Inicia sesión con email y contraseña',
        body: LoginRequestSchema,
        response: { 200: LoginResponseSchema, 400: ErrorResponseSchema, 401: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const [user] = await app.db.select().from(users).where(eq(users.email, email));

      // Se verifica siempre, exista o no el usuario (ver getDummyHash).
      const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);
      // Mismo 401 en los tres casos: no revela si el email existe ni si está desactivado.
      if (!user || !valid || !user.active) {
        return reply.code(401).send(unauthorized('Credenciales incorrectas'));
      }

      const { token } = await createSession(app.db, user.id);
      reply.setCookie(SESSION_COOKIE, token, cookieOptions);
      return { user, token };
    },
  );

  app.post(
    '/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Cierra la sesión actual',
        security: sessionSecurity,
        response: { 204: z.null().describe('Sin cuerpo') },
      },
    },
    async (request, reply) => {
      // Idempotente: 204 haya o no una sesión válida.
      const requestToken = getRequestToken(request);
      if (requestToken) await deleteSession(app.db, requestToken.token);
      reply.clearCookie(SESSION_COOKIE, cookieOptions);
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/auth/me',
    {
      // Por ruta y no por plugin: este plugin también tiene `/auth/login`, que es pública.
      onRequest: app.authenticate,
      schema: {
        tags: ['auth'],
        summary: 'Usuario de la sesión actual',
        security: sessionSecurity,
        response: { 200: MeResponseSchema, 401: ErrorResponseSchema },
      },
    },
    async (request) => ({ user: request.user }),
  );

  app.put(
    '/auth/password',
    {
      onRequest: app.authenticate,
      preHandler: requireRole('admin', 'adult'),
      schema: {
        tags: ['auth'],
        summary: 'Cambia la contraseña propia y cierra las demás sesiones',
        security: sessionSecurity,
        body: ChangePasswordRequestSchema,
        response: {
          204: z.null().describe('Sin cuerpo'),
          400: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { currentPassword, newPassword } = request.body;
      const userId = request.user.id;

      const [user] = await app.db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId));
      if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
        return reply.code(400).send(wrongCurrentPassword);
      }

      const passwordHash = await hashPassword(newPassword);
      // Tras `authenticate` el token existe. Se conserva la sesión actual: quien
      // cambia su contraseña sigue dentro y los demás dispositivos salen.
      const { token } = getRequestToken(request)!;
      await app.db.transaction(async (tx) => {
        await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
        await deleteUserSessions(tx, userId, { exceptToken: token });
      });
      return reply.code(204).send(null);
    },
  );
};

import {
  CreateUserRequestSchema,
  ErrorResponseSchema,
  ResetPasswordRequestSchema,
  UpdateUserRequestSchema,
  UserIdParamsSchema,
  UserListResponseSchema,
  UserSchema,
} from '@jarvis/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authErrorResponses, requireRole, sessionSecurity } from '../../auth/authenticate.js';
import { hashPassword } from '../../auth/password.js';
import { deleteUserSessions } from '../../auth/session.js';
import { isUniqueViolation } from '../../db/errors.js';
import { users } from '../../db/schema/index.js';
import { conflict, notFound } from '../../http-errors.js';

// Columnas de `UserSchema`: el hash de la contraseña ni se lee.
const userColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  active: users.active,
};

const userNotFound = notFound('Usuario no encontrado');
const emailTaken = conflict('Ya existe un usuario con ese email');

// Gestión de usuarios: todo solo para el admin.
export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const adminOnly = requireRole('admin');

  app.get(
    '/users',
    {
      preHandler: adminOnly,
      schema: {
        tags: ['users'],
        summary: 'Lista todos los usuarios (también los inactivos)',
        security: sessionSecurity,
        response: { 200: UserListResponseSchema, ...authErrorResponses },
      },
    },
    async () => ({
      users: await app.db.select(userColumns).from(users).orderBy(users.name),
    }),
  );

  app.get(
    '/users/:id',
    {
      preHandler: adminOnly,
      schema: {
        tags: ['users'],
        summary: 'Detalle de un usuario',
        security: sessionSecurity,
        params: UserIdParamsSchema,
        response: {
          200: UserSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const [user] = await app.db
        .select(userColumns)
        .from(users)
        .where(eq(users.id, request.params.id));
      if (!user) return reply.code(404).send(userNotFound);
      return user;
    },
  );

  app.post(
    '/users',
    {
      preHandler: adminOnly,
      schema: {
        tags: ['users'],
        summary: 'Da de alta un usuario',
        security: sessionSecurity,
        body: CreateUserRequestSchema,
        response: {
          201: UserSchema,
          400: ErrorResponseSchema,
          409: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { password, ...data } = request.body;
      const passwordHash = await hashPassword(password);
      try {
        // Sin comprobar antes si el email existe: la restricción `unique` de
        // Postgres lo rechaza, también si llegan dos altas a la vez.
        const [user] = await app.db
          .insert(users)
          .values({ ...data, passwordHash })
          .returning(userColumns);
        return reply.code(201).send(user!);
      } catch (error) {
        if (isUniqueViolation(error)) return reply.code(409).send(emailTaken);
        throw error;
      }
    },
  );

  app.patch(
    '/users/:id',
    {
      preHandler: adminOnly,
      schema: {
        tags: ['users'],
        summary: 'Edita nombre, email, rol o estado de un usuario',
        security: sessionSecurity,
        params: UserIdParamsSchema,
        body: UpdateUserRequestSchema,
        response: {
          200: UserSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const changes = request.body;

      const [current] = await app.db.select(userColumns).from(users).where(eq(users.id, id));
      if (!current) return reply.code(404).send(userNotFound);

      // Autoprotección: el admin no puede dejar la casa sin nadie que gestione
      // usuarios. Reenviar los mismos valores (formulario completo) sí vale.
      const changesOwnAccess =
        (changes.role !== undefined && changes.role !== current.role) ||
        (changes.active !== undefined && changes.active !== current.active);
      // `current.id` viene de la BD (normalizado): el de la URL puede llegar en
      // mayúsculas y Postgres compara uuid sin distinguirlas.
      if (current.id === request.user.id && changesOwnAccess) {
        return reply.code(409).send(conflict('No puedes cambiar tu propio rol ni desactivarte'));
      }

      try {
        // O se aplican los dos cambios o ninguno: nunca un usuario desactivado
        // con sesiones vivas.
        const user = await app.db.transaction(async (tx) => {
          const [updated] = await tx
            .update(users)
            .set(changes)
            .where(eq(users.id, id))
            .returning(userColumns);
          if (updated && changes.active === false) await deleteUserSessions(tx, id);
          return updated;
        });
        // Por si se borró entre la lectura y el UPDATE.
        if (!user) return reply.code(404).send(userNotFound);
        return user;
      } catch (error) {
        if (isUniqueViolation(error)) return reply.code(409).send(emailTaken);
        throw error;
      }
    },
  );

  app.put(
    '/users/:id/password',
    {
      preHandler: adminOnly,
      schema: {
        tags: ['users'],
        summary: 'Resetea la contraseña de un usuario y cierra todas sus sesiones',
        security: sessionSecurity,
        params: UserIdParamsSchema,
        body: ResetPasswordRequestSchema,
        response: {
          204: z.null().describe('Sin cuerpo'),
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const passwordHash = await hashPassword(request.body.password);

      // Todas las sesiones, también la actual si el admin se resetea a sí mismo
      // (para la suya está `PUT /auth/password`).
      const found = await app.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(users)
          .set({ passwordHash })
          .where(eq(users.id, id))
          .returning({ id: users.id });
        if (updated) await deleteUserSessions(tx, id);
        return updated !== undefined;
      });
      if (!found) return reply.code(404).send(userNotFound);
      return reply.code(204).send(null);
    },
  );
};

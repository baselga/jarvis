import {
  AuthorIdParamsSchema,
  AuthorListQuerySchema,
  AuthorListResponseSchema,
  AuthorSchema,
  CreateAuthorRequestSchema,
  ErrorResponseSchema,
  UpdateAuthorRequestSchema,
} from '@jarvis/schemas';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { authErrorResponses, requireRole, sessionSecurity } from '../../auth/authenticate.js';
import { conflict, notFound } from '../../http-errors.js';
import { createAuthor, deleteAuthor, getAuthor, listAuthors, updateAuthor } from './service.js';

const authorNotFound = notFound('Autor no encontrado');
const nameTaken = conflict('Ya existe un autor con ese nombre');
const hasBooks = conflict('No se puede borrar: el autor tiene libros');

// Leer: cualquier usuario con sesión. Escribir: admin y adulto.
export const authorRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const canWrite = requireRole('admin', 'adult');

  app.get(
    '/authors',
    {
      schema: {
        tags: ['authors'],
        summary: 'Lista autores, con búsqueda por nombre y paginación',
        security: sessionSecurity,
        querystring: AuthorListQuerySchema,
        response: {
          200: AuthorListResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request) => listAuthors(app.db, request.query),
  );

  app.get(
    '/authors/:id',
    {
      schema: {
        tags: ['authors'],
        summary: 'Detalle de un autor',
        security: sessionSecurity,
        params: AuthorIdParamsSchema,
        response: {
          200: AuthorSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const author = await getAuthor(app.db, request.params.id);
      if (!author) return reply.code(404).send(authorNotFound);
      return author;
    },
  );

  app.post(
    '/authors',
    {
      preHandler: canWrite,
      schema: {
        tags: ['authors'],
        summary: 'Crea un autor',
        security: sessionSecurity,
        body: CreateAuthorRequestSchema,
        response: {
          201: AuthorSchema,
          400: ErrorResponseSchema,
          409: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await createAuthor(app.db, request.body);
      switch (result.status) {
        case 'ok':
          return reply.code(201).send(result.author);
        case 'name_taken':
          return reply.code(409).send(nameTaken);
      }
    },
  );

  app.patch(
    '/authors/:id',
    {
      preHandler: canWrite,
      schema: {
        tags: ['authors'],
        summary: 'Cambia el nombre de un autor',
        security: sessionSecurity,
        params: AuthorIdParamsSchema,
        body: UpdateAuthorRequestSchema,
        response: {
          200: AuthorSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await updateAuthor(app.db, request.params.id, request.body);
      switch (result.status) {
        case 'ok':
          return result.author;
        case 'not_found':
          return reply.code(404).send(authorNotFound);
        case 'name_taken':
          return reply.code(409).send(nameTaken);
      }
    },
  );

  app.delete(
    '/authors/:id',
    {
      preHandler: canWrite,
      schema: {
        tags: ['authors'],
        summary: 'Borra un autor que no tenga libros',
        security: sessionSecurity,
        params: AuthorIdParamsSchema,
        response: {
          204: z.null().describe('Sin cuerpo'),
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await deleteAuthor(app.db, request.params.id);
      switch (result.status) {
        case 'ok':
          return reply.code(204).send(null);
        case 'not_found':
          return reply.code(404).send(authorNotFound);
        case 'has_books':
          return reply.code(409).send(hasBooks);
      }
    },
  );
};

import {
  BookIdParamsSchema,
  CreateReadingRequestSchema,
  ErrorResponseSchema,
  ReadingIdParamsSchema,
  ReadingListQuerySchema,
  ReadingListResponseSchema,
  ReadingSchema,
  UpdateReadingRequestSchema,
  readingDateMessages,
} from '@jarvis/schemas';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authErrorResponses, requireRole, sessionSecurity } from '../../auth/authenticate.js';
import { badRequest, forbidden, notFound } from '../../http-errors.js';
import { createReading, deleteReading, listReadings, updateReading } from './service.js';

const bookNotFound = notFound('Libro no encontrado');
const readingNotFound = notFound('Lectura no encontrada');
const notOwner = forbidden('No puedes modificar lecturas de otro');
const noDate = badRequest(readingDateMessages.noDate);
const finishedBeforeStarted = badRequest(readingDateMessages.finishedBeforeStarted);

// Ver: cualquier usuario con sesión (también el invitado). Crear, editar y borrar: admin y
// adulto, y solo sus propias lecturas (ni el admin toca las ajenas).
export const readingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const canWrite = requireRole('admin', 'adult');

  app.get(
    '/readings',
    {
      schema: {
        tags: ['readings'],
        summary: 'Lecturas de la casa, filtrables por libro y por usuario; «leyendo» primero',
        security: sessionSecurity,
        querystring: ReadingListQuerySchema,
        response: {
          200: ReadingListResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request) => listReadings(app.db, request.query),
  );

  app.post(
    '/books/:id/readings',
    {
      preHandler: canWrite,
      schema: {
        tags: ['readings'],
        summary: 'Registra una lectura del usuario de la sesión',
        security: sessionSecurity,
        params: BookIdParamsSchema,
        body: CreateReadingRequestSchema,
        response: {
          201: ReadingSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await createReading(app.db, request.params.id, request.user.id, request.body);
      switch (result.status) {
        case 'ok':
          return reply.code(201).send(result.reading);
        case 'book_not_found':
          return reply.code(404).send(bookNotFound);
      }
    },
  );

  app.patch(
    '/readings/:id',
    {
      preHandler: canWrite,
      schema: {
        tags: ['readings'],
        summary: 'Edita una lectura propia (`null` vacía un campo)',
        security: sessionSecurity,
        params: ReadingIdParamsSchema,
        body: UpdateReadingRequestSchema,
        response: {
          200: ReadingSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await updateReading(app.db, request.params.id, request.user.id, request.body);
      switch (result.status) {
        case 'ok':
          return result.reading;
        case 'not_found':
          return reply.code(404).send(readingNotFound);
        case 'forbidden':
          return reply.code(403).send(notOwner);
        case 'no_date':
          return reply.code(400).send(noDate);
        case 'finished_before_started':
          return reply.code(400).send(finishedBeforeStarted);
      }
    },
  );

  app.delete(
    '/readings/:id',
    {
      preHandler: canWrite,
      schema: {
        tags: ['readings'],
        summary: 'Borra una lectura propia',
        security: sessionSecurity,
        params: ReadingIdParamsSchema,
        response: {
          204: z.null().describe('Sin cuerpo'),
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await deleteReading(app.db, request.params.id, request.user.id);
      switch (result.status) {
        case 'ok':
          return reply.code(204).send(null);
        case 'not_found':
          return reply.code(404).send(readingNotFound);
        case 'forbidden':
          return reply.code(403).send(notOwner);
      }
    },
  );
};

import {
  SagaIdParamsSchema,
  SagaListQuerySchema,
  SagaListResponseSchema,
  SagaDetailSchema,
  SagaSchema,
  CreateSagaRequestSchema,
  ErrorResponseSchema,
  UpdateSagaRequestSchema,
} from '@jarvis/schemas';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authErrorResponses, requireRole, sessionSecurity } from '../../auth/authenticate.js';
import { conflict, notFound } from '../../http-errors.js';
import { createSaga, deleteSaga, getSaga, listSagas, updateSaga } from './service.js';

const sagaNotFound = notFound('Saga no encontrada');
const nameTaken = conflict('Ya existe una saga con ese nombre');
const hasBooks = conflict('No se puede borrar: la saga tiene libros');

// Leer: cualquier usuario con sesión. Escribir: admin y adulto.
export const sagaRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const canWrite = requireRole('admin', 'adult');

  app.get(
    '/sagas',
    {
      schema: {
        tags: ['sagas'],
        summary: 'Lista sagas, con búsqueda por nombre y paginación',
        security: sessionSecurity,
        querystring: SagaListQuerySchema,
        response: {
          200: SagaListResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request) => listSagas(app.db, request.query),
  );

  app.get(
    '/sagas/:id',
    {
      schema: {
        tags: ['sagas'],
        summary: 'Detalle de una saga, con sus libros por orden en la saga',
        security: sessionSecurity,
        params: SagaIdParamsSchema,
        response: {
          200: SagaDetailSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const saga = await getSaga(app.db, request.params.id);
      if (!saga) return reply.code(404).send(sagaNotFound);
      return saga;
    },
  );

  app.post(
    '/sagas',
    {
      preHandler: canWrite,
      schema: {
        tags: ['sagas'],
        summary: 'Crea una saga',
        security: sessionSecurity,
        body: CreateSagaRequestSchema,
        response: {
          201: SagaSchema,
          400: ErrorResponseSchema,
          409: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await createSaga(app.db, request.body);
      switch (result.status) {
        case 'ok':
          return reply.code(201).send(result.saga);
        case 'name_taken':
          return reply.code(409).send(nameTaken);
      }
    },
  );

  app.patch(
    '/sagas/:id',
    {
      preHandler: canWrite,
      schema: {
        tags: ['sagas'],
        summary: 'Cambia el nombre de una saga',
        security: sessionSecurity,
        params: SagaIdParamsSchema,
        body: UpdateSagaRequestSchema,
        response: {
          200: SagaSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await updateSaga(app.db, request.params.id, request.body);
      switch (result.status) {
        case 'ok':
          return result.saga;
        case 'not_found':
          return reply.code(404).send(sagaNotFound);
        case 'name_taken':
          return reply.code(409).send(nameTaken);
      }
    },
  );

  app.delete(
    '/sagas/:id',
    {
      preHandler: canWrite,
      schema: {
        tags: ['sagas'],
        summary: 'Borra una saga que no tenga libros',
        security: sessionSecurity,
        params: SagaIdParamsSchema,
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
      const result = await deleteSaga(app.db, request.params.id);
      switch (result.status) {
        case 'ok':
          return reply.code(204).send(null);
        case 'not_found':
          return reply.code(404).send(sagaNotFound);
        case 'has_books':
          return reply.code(409).send(hasBooks);
      }
    },
  );
};

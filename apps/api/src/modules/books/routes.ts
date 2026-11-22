import {
  BookDetailSchema,
  BookIdParamsSchema,
  BookListQuerySchema,
  BookListResponseSchema,
  CreateBookRequestSchema,
  ErrorResponseSchema,
  UpdateBookRequestSchema,
} from '@jarvis/schemas';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { authErrorResponses, requireRole, sessionSecurity } from '../../auth/authenticate.js';
import { badRequest, notFound } from '../../http-errors.js';
import {
  createBook,
  deleteBook,
  getBook,
  type InvalidReferenceEntity,
  listBooks,
  updateBook,
} from './service.js';

const bookNotFound = notFound('Libro no encontrado');
const invalidReference = {
  author: badRequest('Autor inexistente'),
  genre: badRequest('Género inexistente'),
  saga: badRequest('Saga inexistente'),
} satisfies Record<InvalidReferenceEntity, ReturnType<typeof badRequest>>;
const sagaOrderWithoutSaga = badRequest('El orden en la saga necesita una saga');

// Leer: cualquier usuario con sesión. Escribir: admin y adulto.
export const bookRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const canWrite = requireRole('admin', 'adult');

  app.get(
    '/books',
    {
      schema: {
        tags: ['books'],
        summary: 'Lista libros con búsqueda (título y autores), filtros y paginación',
        security: sessionSecurity,
        querystring: BookListQuerySchema,
        response: {
          200: BookListResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request) => listBooks(app.db, request.query),
  );

  app.get(
    '/books/:id',
    {
      schema: {
        tags: ['books'],
        summary: 'Detalle de un libro, con autores, géneros, saga y préstamo activo',
        security: sessionSecurity,
        params: BookIdParamsSchema,
        response: {
          200: BookDetailSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const book = await getBook(app.db, request.params.id);
      if (!book) return reply.code(404).send(bookNotFound);
      return book;
    },
  );

  app.post(
    '/books',
    {
      preHandler: canWrite,
      schema: {
        tags: ['books'],
        summary: 'Crea un libro con sus autores, géneros y saga',
        security: sessionSecurity,
        body: CreateBookRequestSchema,
        response: {
          201: BookDetailSchema,
          400: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await createBook(app.db, request.body);
      switch (result.status) {
        case 'ok':
          return reply.code(201).send(result.book);
        case 'invalid_reference':
          return reply.code(400).send(invalidReference[result.entity]);
      }
    },
  );

  app.patch(
    '/books/:id',
    {
      preHandler: canWrite,
      schema: {
        tags: ['books'],
        summary: 'Edita un libro: lo omitido no cambia y null borra el campo',
        security: sessionSecurity,
        params: BookIdParamsSchema,
        body: UpdateBookRequestSchema,
        response: {
          200: BookDetailSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await updateBook(app.db, request.params.id, request.body);
      switch (result.status) {
        case 'ok':
          return result.book;
        case 'not_found':
          return reply.code(404).send(bookNotFound);
        case 'invalid_reference':
          return reply.code(400).send(invalidReference[result.entity]);
        case 'saga_order_without_saga':
          return reply.code(400).send(sagaOrderWithoutSaga);
      }
    },
  );

  app.delete(
    '/books/:id',
    {
      preHandler: canWrite,
      schema: {
        tags: ['books'],
        summary: 'Borra un libro con sus préstamos y lecturas',
        security: sessionSecurity,
        params: BookIdParamsSchema,
        response: {
          204: z.null().describe('Sin cuerpo'),
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await deleteBook(app.db, request.params.id);
      switch (result.status) {
        case 'ok':
          return reply.code(204).send(null);
        case 'not_found':
          return reply.code(404).send(bookNotFound);
      }
    },
  );
};

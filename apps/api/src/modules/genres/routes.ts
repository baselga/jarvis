import {
  GenreIdParamsSchema,
  GenreListQuerySchema,
  GenreListResponseSchema,
  GenreSchema,
  CreateGenreRequestSchema,
  ErrorResponseSchema,
  UpdateGenreRequestSchema,
} from '@jarvis/schemas';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authErrorResponses, requireRole, sessionSecurity } from '../../auth/authenticate.js';
import { conflict, notFound } from '../../http-errors.js';
import { createGenre, deleteGenre, getGenre, listGenres, updateGenre } from './service.js';

const genreNotFound = notFound('Género no encontrado');
const nameTaken = conflict('Ya existe un género con ese nombre');
const hasBooks = conflict('No se puede borrar: el género tiene libros');

// Leer: cualquier usuario con sesión. Escribir: admin y adulto.
export const genreRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const canWrite = requireRole('admin', 'adult');

  app.get(
    '/genres',
    {
      schema: {
        tags: ['genres'],
        summary: 'Lista géneros, con búsqueda por nombre y paginación',
        security: sessionSecurity,
        querystring: GenreListQuerySchema,
        response: {
          200: GenreListResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request) => listGenres(app.db, request.query),
  );

  app.get(
    '/genres/:id',
    {
      schema: {
        tags: ['genres'],
        summary: 'Detalle de un género',
        security: sessionSecurity,
        params: GenreIdParamsSchema,
        response: {
          200: GenreSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const genre = await getGenre(app.db, request.params.id);
      if (!genre) return reply.code(404).send(genreNotFound);
      return genre;
    },
  );

  app.post(
    '/genres',
    {
      preHandler: canWrite,
      schema: {
        tags: ['genres'],
        summary: 'Crea un género',
        security: sessionSecurity,
        body: CreateGenreRequestSchema,
        response: {
          201: GenreSchema,
          400: ErrorResponseSchema,
          409: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await createGenre(app.db, request.body);
      switch (result.status) {
        case 'ok':
          return reply.code(201).send(result.genre);
        case 'name_taken':
          return reply.code(409).send(nameTaken);
      }
    },
  );

  app.patch(
    '/genres/:id',
    {
      preHandler: canWrite,
      schema: {
        tags: ['genres'],
        summary: 'Cambia el nombre de un género',
        security: sessionSecurity,
        params: GenreIdParamsSchema,
        body: UpdateGenreRequestSchema,
        response: {
          200: GenreSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await updateGenre(app.db, request.params.id, request.body);
      switch (result.status) {
        case 'ok':
          return result.genre;
        case 'not_found':
          return reply.code(404).send(genreNotFound);
        case 'name_taken':
          return reply.code(409).send(nameTaken);
      }
    },
  );

  app.delete(
    '/genres/:id',
    {
      preHandler: canWrite,
      schema: {
        tags: ['genres'],
        summary: 'Borra un género que no tenga libros',
        security: sessionSecurity,
        params: GenreIdParamsSchema,
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
      const result = await deleteGenre(app.db, request.params.id);
      switch (result.status) {
        case 'ok':
          return reply.code(204).send(null);
        case 'not_found':
          return reply.code(404).send(genreNotFound);
        case 'has_books':
          return reply.code(409).send(hasBooks);
      }
    },
  );
};

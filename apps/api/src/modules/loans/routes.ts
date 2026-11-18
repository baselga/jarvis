import {
  ActiveLoansResponseSchema,
  BookIdParamsSchema,
  BookLoansResponseSchema,
  CreateLoanRequestSchema,
  ErrorResponseSchema,
  LoanIdParamsSchema,
  LoanSchema,
  ReturnLoanRequestSchema,
} from '@jarvis/schemas';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authErrorResponses, requireRole, sessionSecurity } from '../../auth/authenticate.js';
import { badRequest, conflict, notFound } from '../../http-errors.js';
import { createLoan, listActiveLoans, listBookLoans, returnLoan } from './service.js';

const bookNotFound = notFound('Libro no encontrado');
const loanNotFound = notFound('Préstamo no encontrado');
const alreadyLoaned = conflict('El libro ya está prestado');
const alreadyReturned = conflict('El préstamo ya está devuelto');
const returnedBeforeLoaned = badRequest('La devolución no puede ser anterior al préstamo');

// Leer: cualquier usuario con sesión. Prestar y devolver: admin y adulto.
// Devolver es una ruta de acción (`POST /loans/:id/return`) y no un `PATCH`: tiene reglas
// propias (solo una vez) y la intención queda explícita.
export const loanRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const canWrite = requireRole('admin', 'adult');

  app.post(
    '/books/:id/loans',
    {
      preHandler: canWrite,
      schema: {
        tags: ['loans'],
        summary: 'Presta un libro',
        security: sessionSecurity,
        params: BookIdParamsSchema,
        body: CreateLoanRequestSchema,
        response: {
          201: LoanSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await createLoan(app.db, request.params.id, request.body);
      switch (result.status) {
        case 'ok':
          return reply.code(201).send(result.loan);
        case 'book_not_found':
          return reply.code(404).send(bookNotFound);
        case 'already_loaned':
          return reply.code(409).send(alreadyLoaned);
      }
    },
  );

  app.post(
    '/loans/:id/return',
    {
      preHandler: canWrite,
      schema: {
        tags: ['loans'],
        summary: 'Registra la devolución de un préstamo',
        security: sessionSecurity,
        params: LoanIdParamsSchema,
        body: ReturnLoanRequestSchema,
        response: {
          200: LoanSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await returnLoan(app.db, request.params.id, request.body.returnedAt);
      switch (result.status) {
        case 'ok':
          return result.loan;
        case 'not_found':
          return reply.code(404).send(loanNotFound);
        case 'already_returned':
          return reply.code(409).send(alreadyReturned);
        case 'returned_before_loaned':
          return reply.code(400).send(returnedBeforeLoaned);
      }
    },
  );

  app.get(
    '/books/:id/loans',
    {
      schema: {
        tags: ['loans'],
        summary: 'Historial de préstamos de un libro, del más reciente al más antiguo',
        security: sessionSecurity,
        params: BookIdParamsSchema,
        response: {
          200: BookLoansResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await listBookLoans(app.db, request.params.id);
      switch (result.status) {
        case 'ok':
          return { loans: result.loans };
        case 'book_not_found':
          return reply.code(404).send(bookNotFound);
      }
    },
  );

  app.get(
    '/loans/active',
    {
      schema: {
        tags: ['loans'],
        summary: 'Libros fuera de casa, del préstamo más antiguo al más reciente',
        security: sessionSecurity,
        response: {
          200: ActiveLoansResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async () => ({ loans: await listActiveLoans(app.db) }),
  );
};

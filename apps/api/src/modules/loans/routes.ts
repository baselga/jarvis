import {
  ActiveLoansResponseSchema,
  BookIdParamsSchema,
  BookLoansResponseSchema,
  CreateLoanRequestSchema,
  ErrorResponseSchema,
  LoanIdParamsSchema,
  LoanSchema,
  ReturnLoanRequestSchema,
  UpdateLoanRequestSchema,
} from '@jarvis/schemas';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { authErrorResponses, requireRole, sessionSecurity } from '../../auth/authenticate.js';
import { badRequest, conflict, notFound } from '../../http-errors.js';
import {
  createLoan,
  deleteLoan,
  listActiveLoans,
  listBookLoans,
  returnLoan,
  updateLoan,
} from './service.js';

const bookNotFound = notFound('Libro no encontrado');
const loanNotFound = notFound('Préstamo no encontrado');
const alreadyLoaned = conflict('El libro ya está prestado');
const alreadyReturned = conflict('El préstamo ya está devuelto');
const otherActiveLoan = conflict('El libro ya tiene otro préstamo activo');
const returnedBeforeLoaned = badRequest('La devolución no puede ser anterior al préstamo');

// Leer: cualquier usuario con sesión. Prestar, devolver, corregir y borrar: admin y adulto.
// Devolver es una ruta de acción (`POST /loans/:id/return`): tiene reglas propias (solo una
// vez) y la intención queda explícita. `PATCH /loans/:id` es la herramienta de corrección
// (sin reglas de flujo; las invariantes las protege la BD en ambas vías).
// Prestar y devolver sin fecha usan hoy en la zona de casa (`app.today()`). El valor por
// defecto se pone aquí, en la capa HTTP: el servicio recibe la fecha ya resuelta.
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
        description: 'Sin loanedAt, la fecha del préstamo es hoy en la zona de casa (HOME_TZ).',
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
      const result = await createLoan(app.db, request.params.id, {
        borrower: request.body.borrower,
        loanedAt: request.body.loanedAt ?? app.today(),
      });
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
        description:
          'Sin returnedAt (o sin cuerpo), la fecha de devolución es hoy en la zona de casa (HOME_TZ).',
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
      const returnedAt = request.body?.returnedAt ?? app.today();
      const result = await returnLoan(app.db, request.params.id, returnedAt);
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

  app.patch(
    '/loans/:id',
    {
      preHandler: canWrite,
      schema: {
        tags: ['loans'],
        summary: 'Corrige un préstamo (prestatario y fechas; returnedAt: null lo reabre)',
        security: sessionSecurity,
        params: LoanIdParamsSchema,
        body: UpdateLoanRequestSchema,
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
      const result = await updateLoan(app.db, request.params.id, request.body);
      switch (result.status) {
        case 'ok':
          return result.loan;
        case 'not_found':
          return reply.code(404).send(loanNotFound);
        case 'returned_before_loaned':
          return reply.code(400).send(returnedBeforeLoaned);
        case 'already_loaned':
          return reply.code(409).send(otherActiveLoan);
      }
    },
  );

  app.delete(
    '/loans/:id',
    {
      preHandler: canWrite,
      schema: {
        tags: ['loans'],
        summary: 'Borra un préstamo registrado por error, esté activo o devuelto',
        security: sessionSecurity,
        params: LoanIdParamsSchema,
        response: {
          204: z.null().describe('Sin cuerpo'),
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          ...authErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await deleteLoan(app.db, request.params.id);
      switch (result.status) {
        case 'ok':
          return reply.code(204).send(null);
        case 'not_found':
          return reply.code(404).send(loanNotFound);
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

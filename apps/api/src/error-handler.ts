import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

import { isDbUnavailable } from './db/errors.js';
import { serviceUnavailable } from './http-errors.js';

// Manejador global (`app.setErrorHandler`): todo error lanzado en hooks o handlers acaba aquí.
// - 4xx (validación, 401/403 lanzados…) → se relanza y lo responde el manejador de Fastify,
//   con su forma y mensajes de siempre. Va primero: un cuerpo cortado por el cliente llega como
//   `ECONNRESET` con `statusCode: 400` y no es la BD (sus errores nunca traen `statusCode`).
// - BD caída → 503, en cualquier ruta (también en `authenticate`).
// - Resto → 500 con mensaje genérico: el de Drizzle lleva el SQL y sus parámetros; va al log.
export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  // Como Fastify, se acepta también `status` (lo usan librerías como `http-errors`).
  const status = error.statusCode ?? (error as { status?: unknown }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    throw error;
  }
  if (isDbUnavailable(error)) {
    request.log.error({ err: error }, 'La BD no responde');
    return reply.code(503).send(serviceUnavailable('La base de datos no está disponible'));
  }
  request.log.error({ err: error }, 'Error no controlado');
  return reply
    .code(500)
    .send({ statusCode: 500, error: 'Internal Server Error', message: 'Error interno' });
}

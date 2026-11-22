import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyRequest } from 'fastify';

import { SESSION_TTL_MS } from './session.js';

export const SESSION_COOKIE = 'jarvis_session';

// Un solo sitio para las opciones: `setCookie` y `clearCookie` deben coincidir
// en `path` (y demás) o el navegador no borra la cookie.
export function sessionCookieOptions(secure: boolean): CookieSerializeOptions {
  return {
    httpOnly: true, // invisible para el JavaScript de la página (XSS)
    sameSite: 'lax', // otros sitios no la envían en POST (CSRF)
    path: '/',
    maxAge: SESSION_TTL_MS / 1000, // en segundos
    secure, // solo HTTPS (producción)
  };
}

// Si hay cabecera `Authorization`, manda ella: si no es un Bearer válido no se
// prueba la cookie, para que no haya dudas sobre con qué identidad se actúa.
export function getRequestToken(
  request: FastifyRequest,
): { token: string; source: 'bearer' | 'cookie' } | null {
  const header = request.headers.authorization;
  if (header !== undefined) {
    const match = /^Bearer (\S+)$/.exec(header);
    return match ? { token: match[1]!, source: 'bearer' } : null;
  }
  const cookie = request.cookies[SESSION_COOKIE];
  return cookie ? { token: cookie, source: 'cookie' } : null;
}

// Cuerpos de error con la forma de `ErrorResponseSchema` (@jarvis/schemas).
export const notFound = (message: string) =>
  ({ statusCode: 404, error: 'Not Found', message }) as const;

export const badRequest = (message: string) =>
  ({ statusCode: 400, error: 'Bad Request', message }) as const;

export const conflict = (message: string) =>
  ({ statusCode: 409, error: 'Conflict', message }) as const;

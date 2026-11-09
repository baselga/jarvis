import { z } from 'zod';

// Valores en inglés en el código; en la documentación: admin, adulto, invitado.
export const RoleSchema = z.enum(['admin', 'adult', 'guest']);

export type Role = z.infer<typeof RoleSchema>;

import { z } from 'zod';

// Valores en inglés en el código; en la documentación: admin, adulto, invitado.
export const RoleSchema = z.enum(['admin', 'adult', 'guest']);

export type Role = z.infer<typeof RoleSchema>;

// El máximo evita hashear textos enormes (argon2 es caro).
export const PasswordSchema = z.string().min(8).max(256);

export type Password = z.infer<typeof PasswordSchema>;

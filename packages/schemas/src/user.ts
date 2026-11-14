import { z } from 'zod';

// Valores en inglés en el código; en la documentación: admin, adulto, invitado.
export const RoleSchema = z.enum(['admin', 'adult', 'guest']);

export type Role = z.infer<typeof RoleSchema>;

// Normalizado (sin espacios, en minúsculas) para que el login encuentre al usuario
// escriba como escriba el email: úsalo en todo lo que guarde o busque un email.
export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email());

export type Email = z.infer<typeof EmailSchema>;

// El máximo evita hashear textos enormes (argon2 es caro).
export const PasswordSchema = z.string().min(8).max(256);

export type Password = z.infer<typeof PasswordSchema>;

import { z } from 'zod';
import { EmailSchema, PasswordSchema, RoleSchema } from './user.js';

// La contraseña no usa PasswordSchema: el mínimo de 8 es para crearlas; aquí
// una corta debe dar 401 (credenciales incorrectas), no 400.
export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(256),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

// Lo que se expone del usuario autenticado (nunca el hash de la contraseña).
export const AuthUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: RoleSchema,
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

// El token va también en el cuerpo para clientes sin cookies (el asistente lo usa como Bearer).
export const LoginResponseSchema = z.object({
  user: AuthUserSchema,
  token: z.string(),
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const MeResponseSchema = z.object({
  user: AuthUserSchema,
});

export type MeResponse = z.infer<typeof MeResponseSchema>;

// `currentPassword` sin el mínimo de 8, como en el login: solo se comprueba.
export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: PasswordSchema,
});

export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

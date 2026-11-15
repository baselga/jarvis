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

export const UserNameSchema = z.string().trim().min(1).max(100);

// Lo que ve el admin de cada usuario (nunca el hash de la contraseña).
export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: RoleSchema,
  active: z.boolean(),
});

export type User = z.infer<typeof UserSchema>;

export const CreateUserRequestSchema = z.object({
  name: UserNameSchema,
  email: EmailSchema,
  role: RoleSchema,
  password: PasswordSchema,
});

export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

// Cambio parcial: solo se tocan los campos enviados. Un cuerpo vacío es un error
// del cliente (400), no un cambio que no hace nada.
export const UpdateUserRequestSchema = z
  .object({
    name: UserNameSchema.optional(),
    email: EmailSchema.optional(),
    role: RoleSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Indica al menos un campo que cambiar',
  });

export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

// Reset por el admin: la contraseña nueva entera, sin pedir la anterior.
export const ResetPasswordRequestSchema = z.object({
  password: PasswordSchema,
});

export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

// Objeto y no array: se le pueden añadir campos sin romper clientes.
export const UserListResponseSchema = z.object({
  users: z.array(UserSchema),
});

export type UserListResponse = z.infer<typeof UserListResponseSchema>;

// Un id mal formado da 400 de validación en vez de un 500 de Postgres.
export const UserIdParamsSchema = z.object({
  id: z.uuid(),
});

export type UserIdParams = z.infer<typeof UserIdParamsSchema>;

import { RoleSchema } from '@jarvis/schemas';
import { sql } from 'drizzle-orm';
import { boolean, check, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Enum de Postgres a partir del de Zod: una sola fuente de roles, y la BD rechaza
// cualquier valor fuera de ella. Se usa `.enum` (objeto) porque en Zod 4
// `.options` es un array, no la tupla que pide `pgEnum`.
export const roleEnum = pgEnum('user_role', RoleSchema.enum);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    // En minúsculas: lo normaliza `EmailSchema` y lo exige el `check` de abajo, así la
    // unicidad no depende de mayúsculas y el login (que busca tal cual) siempre lo encuentra.
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [check('users_email_lowercase', sql`${table.email} = lower(${table.email})`)],
);

export const sessions = pgTable(
  'sessions',
  {
    // Hash SHA-256 (hex) del token: el token en claro nunca se guarda.
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

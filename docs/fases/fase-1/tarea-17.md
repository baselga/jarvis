# Tarea 17 — Emails en minúsculas en BD

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                  |
| Tamaño | pequeña                     |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

La BD garantiza que todo email de `users` está en minúsculas, no solo `EmailSchema`. Una migración normaliza los existentes y añade un `check`; así un alta que se salte Zod (script, SQL a mano) falla en vez de crear un usuario que no puede hacer login.

## Decisiones

- `check (email = lower(email))` sin `trim` — `z.email()` ya rechaza espacios y el plan pide solo `lower`.
- `UPDATE` de normalización en la misma migración generada, antes del `ADD CONSTRAINT` — el `check` se valida contra las filas existentes; misma transacción, o se aplica todo o nada.
- Si dos emails solo difieren en mayúsculas, la migración falla (choque con el `unique`) y no se fusionan usuarios — en la práctica no ocurre (la API siempre normalizó) y fusionar cuentas a ciegas es peor que resolverlo a mano.
- `expectPgCode` se mueve de `library.test.ts` a `test/helpers.ts` — se reutiliza en vez de copiarlo.
- El `UPDATE` de la migración no tiene test automático (los tests migran una BD vacía); se verifica a mano en la BD de desarrollo.

## Especificación

- `apps/api/src/db/schema/users.ts`: tercer argumento de `pgTable('users', …)` con `check('users_email_lowercase', sql\`${table.email} = lower(${table.email})\`)`. Actualizar el comentario del campo `email` (ahora lo garantiza también la BD).
- `pnpm --filter @jarvis/api db:generate` genera `drizzle/0002_*.sql` (+ snapshot y journal). Editar ese SQL antes del `ALTER TABLE … ADD CONSTRAINT`:
  ```sql
  UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");--> statement-breakpoint
  ```
  con un comentario SQL que explique por qué va antes.
- Sin cambios en rutas ni esquemas Zod. Un insert con mayúsculas da `23514` (`isCheckViolation`); ninguna ruta lo provoca porque todas usan `EmailSchema`.
- Verificación manual en la BD de desarrollo: antes de aplicar la migración, `UPDATE users SET email = upper(email)` en algún usuario (o insertar uno); tras `docker compose restart api`, el email queda en minúsculas y la restricción existe (`\d users`).

## Archivos

- `apps/api/src/db/schema/users.ts` — modificar: `check` y comentario.
- `apps/api/drizzle/0002_*.sql`, `drizzle/meta/0002_snapshot.json`, `drizzle/meta/_journal.json` — generar con `db:generate`; editar el SQL para añadir el `UPDATE`.
- `apps/api/src/test/helpers.ts` — modificar: exportar `expectPgCode` (movido desde `library.test.ts`).
- `apps/api/src/db/schema/library.test.ts` — modificar: importar `expectPgCode` de los helpers.
- `apps/api/src/db/schema/users.test.ts` — crear: tests de la restricción.
- `apps/api/CLAUDE.md` — modificar: la línea «Emails» (la BD también lo exige) y mencionar `expectPgCode` en Tests.
- `docs/deuda.md` — modificar: quitar «Emails normalizados solo por Zod».

## Subtareas

- [x] **17.1 — todo:** restricción, migración con normalización, helper movido, tests y docs. Tests: los de abajo.

## Tests

No obligatorios (no es auth, roles ni permisos); el comportamiento nuevo de la tarea:

- [x] insertar en `users` directamente un email con mayúsculas (`Ana@Test.local`) → error `23514`
- [x] insertar `ana@test.local` → se crea
- [x] `library.test.ts` sigue en verde tras mover `expectPgCode`

## Conceptos nuevos

- **Migración de datos dentro de una de esquema:** cuando una restricción nueva no la cumplirían las filas actuales, se corrigen los datos (`UPDATE`) en la misma migración y antes del `ALTER`; la transacción garantiza que no quede a medias.

## Fuera de alcance

- Normalizar con `trim` en la BD.
- Búsqueda sin tildes (tarea 18).

## Registro de implementación

### 17.1 — todo

- **Archivos:** `apps/api/src/db/schema/users.ts` (`check` + comentario; la tabla pasa a la forma con tercer argumento, de ahí el reindentado), `apps/api/drizzle/0002_sour_azazel.sql` (generado + `UPDATE` y comentario a mano), `drizzle/meta/0002_snapshot.json` y `_journal.json` (generados), `src/test/helpers.ts` (`expectPgCode` exportado; importa `expect` de Vitest), `src/db/schema/library.test.ts` (lo importa), `src/db/schema/users.test.ts` (nuevo), `apps/api/CLAUDE.md` (Emails y Tests), `docs/deuda.md`.
- **Sin desviaciones.** El test de mayúsculas falló antes de generar la migración (sin `23514`) y pasa después.
- **Verificación manual en desarrollo:** `UPDATE users SET email = upper(email)` sobre el único usuario (el admin) → `docker compose restart api` → la migración lo dejó en minúsculas y `\d users` muestra `users_email_lowercase CHECK (email = lower(email))`.
- **Para la revisión:** `helpers.ts` ahora importa `vitest`; solo lo usan los tests, pero es el primer helper con aserciones.

## Revisión

Resultado: lista para terminar

Cumple la especificación: `check` en el esquema y en el snapshot, `UPDATE` antes del `ALTER` en `0002_sour_azazel.sql` (el migrador de Drizzle aplica las pendientes en una transacción), `expectPgCode` movido, docs y deuda al día. La BD de desarrollo no tiene emails con mayúsculas. Typecheck, lint, Prettier y tests (336) en verde. El `import 'vitest'` de `helpers.ts` no afecta al build: `tsconfig.build.json` excluye `src/test`.

- [ ] **R1 · opcional · `apps/api/src/db/schema/users.test.ts:7`** — `CHECK_VIOLATION = '23514'` se repite aquí y en `library.test.ts` (y en `db/errors.ts`) → exportar las constantes de códigos desde `test/helpers.ts` junto a `expectPgCode`. Igual que con el helper: no copiar. No es trivial porque toca tres archivos. (descartada: una constante de una línea en dos tests; repetirla cuesta poco)

## Cierre

- **Documentado:** `apps/api/CLAUDE.md` (Emails: la BD exige minúsculas con `users_email_lowercase`; Tests: `expectPgCode` en los helpers), nota en `fase-1-plan.md` y entrada de emails quitada de `docs/deuda.md`.
- **Pendientes:** ninguno. R1 (constante `CHECK_VIOLATION` repetida en dos tests) se descartó: no va a deuda.

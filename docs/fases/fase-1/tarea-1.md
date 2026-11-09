# Tarea 1 — Migraciones y tablas de usuarios

Estado: terminada
Tamaño: normal
Fase: 1 · Plan: docs/fases/fase-1-plan.md

## Objetivo
La API tiene migraciones versionadas con Drizzle y las tablas `users` y `sessions`. Al levantar Compose en desarrollo, las migraciones pendientes se aplican solas antes de arrancar el servidor. Es la base de la auth (tareas 4–7) y de la infra de tests (tarea 2).

## Decisiones
- **`drizzle-kit` solo genera el SQL; las migraciones se aplican con `migrate()` de `drizzle-orm`** desde un script propio. Así `drizzle-kit` sigue siendo dependencia de desarrollo, y el mismo script vale para dev, para prod y para el setup de tests (tarea 2).
- **Tablas en `src/db/schema/`**, un archivo por bloque (`users.ts`), reexportadas en `index.ts`. **Migraciones en `apps/api/drizzle/`**, versionadas en git.
- **Valores de rol en inglés: `admin`, `adult`, `guest`**, en `RoleSchema` (`packages/schemas`). En la documentación en español se siguen llamando admin, adulto e invitado.
- **`role` como enum de Postgres (`pgEnum`) a partir de `RoleSchema.options`.** Hay una sola lista de roles y la BD rechaza los valores inválidos.
- **Email único y guardado en minúsculas.** Así no hay dos cuentas que solo se diferencien en mayúsculas. Esta tarea pone la restricción de unicidad; pasar el email a minúsculas al escribirlo es cosa de quien lo escriba (seed y gestión de usuarios).
- **La sesión se identifica por el hash SHA-256 (hex) del token, que es su clave primaria.** El token tiene 32 bytes aleatorios, así que un hash rápido es seguro y cada petición se resuelve en una búsqueda por PK. Argon2 se queda para las contraseñas, que tienen poca entropía.
- **`sessions` sin `last_used_at` ni user-agent/IP.** Para la renovación deslizante basta con mover `expires_at`.

## Especificación

### `packages/schemas`
- `src/user.ts`: `export const RoleSchema = z.enum(['admin', 'adult', 'guest'])` y `export type Role = z.infer<typeof RoleSchema>`.
- Se exporta desde `src/index.ts`.

### Tablas (`apps/api/src/db/schema/users.ts`)
- `roleEnum = pgEnum('user_role', RoleSchema.options)`.
- `users`:
  | columna | tipo | notas |
  |---|---|---|
  | `id` | `uuid` | PK, `default gen_random_uuid()` (`defaultRandom()`) |
  | `name` | `text` | not null |
  | `email` | `text` | not null, `unique` |
  | `password_hash` | `text` | not null |
  | `role` | `user_role` | not null |
  | `active` | `boolean` | not null, default `true` |
  | `created_at` | `timestamptz` | not null, default `now()` |
  | `updated_at` | `timestamptz` | not null, default `now()`, `$onUpdate(() => new Date())` |
- `sessions`:
  | columna | tipo | notas |
  |---|---|---|
  | `id` | `text` | PK: hash SHA-256 en hex del token |
  | `user_id` | `uuid` | not null, FK → `users.id` `on delete cascade`, índice |
  | `created_at` | `timestamptz` | not null, default `now()` |
  | `expires_at` | `timestamptz` | not null |
- Las propiedades en TS van en camelCase (`passwordHash`, `userId`…) y las columnas en snake_case.
- `src/db/schema/index.ts` reexporta todo. `createDb()` pasa `{ schema }` a `drizzle()`, para tener tipos y la API relacional más adelante.

### Drizzle Kit y scripts (`apps/api`)
- `drizzle.config.ts`: `dialect: 'postgresql'`, `schema: './src/db/schema/index.ts'`, `out: './drizzle'`. No lleva credenciales porque `generate` no se conecta a la BD.
- `src/db/migrate.ts`: lee la config con `loadConfig()`, crea una conexión `postgres` con `max: 1`, ejecuta `migrate(db, { migrationsFolder })` con la ruta resuelta desde el archivo (no desde el cwd), registra cuántas o que terminó y cierra la conexión. Si falla, sale con código ≠ 0 para que el contenedor no arranque con la BD a medias.
- Scripts en `package.json`:
  - `db:generate`: `drizzle-kit generate`
  - `db:migrate`: `tsx --conditions=development src/db/migrate.ts`
  - `dev`: `pnpm db:migrate && tsx watch --conditions=development src/server.ts`
- Dependencia nueva: `drizzle-kit` (dev).
- Se genera la migración inicial con `pnpm --filter @jarvis/api db:generate` y se commitea (`drizzle/0000_*.sql` y `drizzle/meta/`).
- Si `drizzle-kit` no resuelve `@jarvis/schemas` porque no aplica la condición `development`, prueba a lanzarlo con `NODE_OPTIONS=--conditions=development`. Si tampoco funciona, anótalo en el registro y decide lo mínimo que lo arregle sin duplicar la lista de roles.
- Producción: esta tarea no cambia el `CMD` de `prod`, que queda anotado en Fuera de alcance. El `Dockerfile` no cambia porque no hay paquetes nuevos en el workspace.

### Documentación
- `apps/api/CLAUDE.md`: añadir `src/db/schema/`, `src/db/migrate.ts` y `drizzle/` a la estructura. Añadir un patrón "Cambiar el modelo: editar `src/db/schema/` → `pnpm --filter @jarvis/api db:generate` → revisar el SQL → se aplica al reiniciar `api`". Quitar de "Pendiente de decidir" lo que ya queda resuelto (tablas y migraciones).
- `CLAUDE.md` raíz: la regla de roles pasa a `admin`, `adult`, `guest` (admin, adulto, invitado).
- `docs/dominio.md`: indicar junto a cada rol su valor en el código (`admin`, `adult`, `guest`).

## Archivos
- `packages/schemas/src/user.ts` — crear: `RoleSchema`, `Role`.
- `packages/schemas/src/index.ts` — modificar: exportar `user.ts`.
- `apps/api/src/db/schema/users.ts` — crear: `roleEnum`, `users`, `sessions`.
- `apps/api/src/db/schema/index.ts` — crear: reexporta.
- `apps/api/src/db/client.ts` — modificar: `drizzle({ client, schema })`.
- `apps/api/src/db/migrate.ts` — crear: script de migración.
- `apps/api/drizzle.config.ts` — crear.
- `apps/api/package.json` — modificar: `drizzle-kit`, scripts `db:generate`, `db:migrate`, `dev`.
- `apps/api/drizzle/*` — generado: migración inicial.
- `apps/api/CLAUDE.md`, `CLAUDE.md`, `docs/dominio.md` — modificar: documentación.

## Subtareas
- [x] **1.1 — todo.** Tests: ninguno automático (la infra con BD llega en la tarea 2). Verificación manual abajo.

## Tests
Sin tests automáticos en esta tarea. Se verifica a mano:
- [x] Con la BD vacía, `docker compose up -d --build -V` → los logs de `api` muestran la migración aplicada y el servidor arrancado.
- [x] `docker compose restart api` → no reaplica nada y arranca igual.
- [x] En `psql`, `\d users` y `\d sessions` muestran las columnas, la unicidad de `email`, la FK con cascade y el índice de `user_id`. `\dT+ user_role` lista `admin`, `adult` y `guest`.
- [x] Insertar un usuario con `role = 'adulto'` → error de Postgres (el enum lo rechaza).
- [x] `pnpm -r typecheck`, `pnpm -r lint` y `pnpm -r test` pasan (los tests de `health` siguen en verde).

## Conceptos nuevos
- **Migraciones:** son archivos SQL numerados y versionados que llevan la BD de una versión del esquema a la siguiente. Drizzle apunta en la tabla `__drizzle_migrations` cuáles se han aplicado, y por eso ejecutarlas dos veces no hace nada.
- **`generate` frente a `migrate`:** `generate` compara el esquema en TS con el último snapshot y escribe el SQL de la diferencia. `migrate` aplica a la BD el SQL pendiente. El SQL se revisa y se commitea, para que todas las BD sigan el mismo camino.
- **Enum de Postgres:** es un tipo con valores cerrados que se valida en la propia BD. Añadir un valor necesita una migración.
- **Clave foránea con `ON DELETE CASCADE`:** al borrar la fila padre, la BD borra sola sus hijas. En este caso, borrar un usuario borra sus sesiones (aunque los usuarios no se borran, se desactivan).
- **Hash rápido vs. hash lento:** un token aleatorio largo no se puede adivinar, así que basta con SHA-256. Una contraseña humana sí se puede adivinar, y por eso necesita un hash lento como argon2.

## Fuera de alcance
- Aplicar migraciones en la imagen `prod` (cambiar su `CMD`) — cuando se despliegue en el servidor de casa.
- BD `jarvis_test` y setup de Vitest que migra — tarea 2.
- Hash de contraseñas y seed del admin — tarea 4.
- Crear y renovar sesiones, y pasar el email a minúsculas al crear usuarios — tareas 4, 5 y 7.

## Registro de implementación

### 1.1 — todo (2026-11-09)
- **Archivos creados:** `packages/schemas/src/user.ts`, `apps/api/src/db/schema/users.ts`, `apps/api/src/db/schema/index.ts`, `apps/api/src/db/migrate.ts`, `apps/api/drizzle.config.js`, `apps/api/drizzle/0000_thick_the_hand.sql`, `apps/api/drizzle/meta/`.
- **Modificados:** `packages/schemas/src/index.ts`, `apps/api/src/db/client.ts`, `apps/api/package.json` (+ `pnpm-lock.yaml`), `apps/api/CLAUDE.md`, `CLAUDE.md`, `docs/dominio.md`.
- **Desviaciones:**
  - `pgEnum('user_role', RoleSchema.enum)` en vez de `RoleSchema.options`: en Zod 4 `.options` es un array (`Role[]`), no la tupla no vacía que pide `pgEnum`, y no compila. `.enum` es el objeto `{ admin: 'admin', … }` que `pgEnum` acepta en su segunda sobrecarga; el SQL es el mismo y el tipo de `users.role` sigue siendo `'admin' | 'adult' | 'guest'` (comprobado con un `@ts-expect-error` temporal). Sigue habiendo una sola lista de roles.
  - `drizzle.config.js` en vez de `.ts`: con `.ts`, ESLint fallaba porque el archivo queda fuera del `tsconfig` (`include: ["src"]`). Se sigue el precedente de `vitest.config.js` en vez de tocar la config de ESLint. `drizzle-kit` lo encuentra solo.
  - `db:generate` lleva `NODE_OPTIONS=--conditions=development`: sin ello `drizzle-kit` busca `@jarvis/schemas/dist` y falla (la vía prevista en la especificación).
  - `migrate.ts` pasa `onnotice: () => {}` a `postgres`: en cada arranque Drizzle hace `CREATE SCHEMA/TABLE IF NOT EXISTS` y Postgres responde con NOTICE que `postgres.js` imprime como objetos en el log.
- **Para la revisión:** el log dice "Migraciones aplicadas" también cuando no había ninguna pendiente (`migrate()` no devuelve cuántas). Verificación manual hecha: migración aplicada con BD vacía, `restart` sin reaplicar (una sola fila en `drizzle.__drizzle_migrations`), `\d users`/`\d sessions`/`\dT+ user_role` correctos, `role = 'adulto'` rechazado por el enum; typecheck, lint y tests (5) en verde.

## Revisión

Resultado: lista para terminar

- [x] **R1 · opcional · trivial · `apps/api/src/db/migrate.ts:23`** — El log dice "Migraciones aplicadas" también cuando no había ninguna pendiente → cambiarlo a "Migraciones al día". Es cierto en los dos casos, porque `migrate()` no devuelve cuántas ha aplicado. (aceptada)

Sin más hallazgos. Se cumple la especificación, incluida la verificación manual, y las cuatro desviaciones están justificadas: siguen dejando una sola lista de roles y el SQL generado coincide con las tablas especificadas. Si `loadConfig()` falla fuera del `try`, el proceso también sale con código ≠ 0 y no queda ninguna conexión abierta. Typecheck, lint, tests (5) y Prettier en verde.

## Cierre
- **Documentado:** estructura de `src/db/schema/`, `migrate.ts` y `drizzle/`, y los patrones "Cambiar el modelo" y "Enums de Postgres desde Zod" en `apps/api/CLAUDE.md`. Valores de rol en el `CLAUDE.md` raíz y en `docs/dominio.md`.
- **Deuda y pendientes** (anotados en las Notas de `fase-1-plan.md`): el `CMD` de `prod` no migra; el email se pasa a minúsculas en las tareas 4 y 7.
- **Para la tarea 2:** `src/db/migrate.ts` sirve de referencia para el setup de Vitest (`migrationsFolder` resuelto desde el archivo y `onnotice` silenciado). Los scripts que importan `@jarvis/*` necesitan `--conditions=development`.

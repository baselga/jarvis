# Tarea 4 — Contraseñas y seed

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

Hash y verificación de contraseñas con argon2, y un script `db:seed` que crea el primer admin a partir del `.env`. Al terminar se puede tener un admin real en la BD (con contraseña verificable) para el login de la tarea 5.

## Decisiones

- **`@node-rs/argon2` con sus parámetros por defecto (argon2id)** — coinciden con la recomendación de OWASP; el hash lleva dentro algoritmo, parámetros y *salt*, así que no se guarda nada más y se pueden subir parámetros sin romper hashes antiguos.
- **`verifyPassword` devuelve `false` ante un hash malformado** (no lanza) — un hash roto equivale a contraseña incorrecta, no a un 500 en el login.
- **Seed manual (`pnpm db:seed`), no al arrancar** — las credenciales del admin solo hacen falta al instalar; el servidor no debe depender de ellas.
- **Seed idempotente y sin sobrescribir:** si ya existe un usuario con `ADMIN_EMAIL`, no hace nada (ni contraseña ni rol) — se puede relanzar sin riesgo y nunca pisa la contraseña cambiada desde la web.
- **`ADMIN_*` validadas con un esquema Zod propio del seed**, no en `EnvSchema` de `config.ts` — el servidor arranca sin ellas.
- **`PasswordSchema` en `packages/schemas`** (8–256 caracteres) — la reutilizarán la tarea 7 (crear usuario, cambiar/resetear contraseña); el máximo evita hashear textos enormes.
- **`createUser` solo hashea si se le pasa `password`** — argon2 es lento a propósito (~50 ms); los tests que no hacen login no pagan ese coste.

## Especificación

### `packages/schemas/src/user.ts`

- `PasswordSchema = z.string().min(8).max(256)` y `type Password`.

### `apps/api/src/auth/password.ts`

- `hashPassword(plain: string): Promise<string>` — `hash` de `@node-rs/argon2` con opciones por defecto.
- `verifyPassword(hash: string, plain: string): Promise<boolean>` — `verify`; cualquier error (hash malformado) → `false`.

### `apps/api/src/db/seed-admin.ts`

- `seedAdmin(db, { name, email, password }): Promise<'created' | 'exists'>`.
- Normaliza `email` a minúsculas (y `trim`).
- Inserta `{ name, email, passwordHash: await hashPassword(password), role: 'admin', active: true }` con `onConflictDoNothing({ target: users.email })` y `returning()`: si devuelve fila → `'created'`; si no → `'exists'`. (Atómico: no hay carrera entre "comprobar" e "insertar".)
- El tipo de `db` es el que devuelve `createDb(...).db` (el mismo que usa `buildApp`).

### `apps/api/src/db/seed.ts` (script)

Mismo estilo que `migrate.ts`:

- Lee `DATABASE_URL` con `loadConfig()` y las variables del admin con su esquema:
  - `ADMIN_EMAIL`: `z.email()` obligatoria.
  - `ADMIN_PASSWORD`: `PasswordSchema` obligatoria.
  - `ADMIN_NAME`: `z.string().min(1).default('Admin')`.
- Si la validación falla: error con `z.prettifyError` y `process.exitCode = 1` (sin tocar la BD).
- Crea la conexión con `createDb`, llama a `seedAdmin` y la cierra siempre (`finally`).
- Mensajes: `Admin creado: <email>` / `Ya existe un usuario con <email>; no se modifica`. Nunca imprime la contraseña.
- Error de BD → `console.error` + `process.exitCode = 1`.

### Scripts y entorno

- `apps/api/package.json`: dependencia `@node-rs/argon2`; script `"db:seed": "tsx --conditions=development src/db/seed.ts"`.
- `.env.example`: bloque `# Primer admin (solo lo usa pnpm db:seed)` con `ADMIN_EMAIL=`, `ADMIN_PASSWORD=` (comentar mínimo 8 caracteres) y `ADMIN_NAME=Admin`.
- `docker-compose.yml`, servicio `api`: `ADMIN_EMAIL: ${ADMIN_EMAIL:-}`, `ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}`, `ADMIN_NAME: ${ADMIN_NAME:-Admin}` (vacías no rompen el arranque; el seed las rechaza con un mensaje claro).
- Tras añadir la dependencia: `docker compose up -d --build -V` (binario nativo de argon2 para Alpine/musl dentro de la imagen).

### Helper de tests

- `createUser(overrides)` acepta además `password?: string`: si viene, `passwordHash = await hashPassword(password)`; si no, sigue `'not-a-hash'`. `password` no se pasa a `values()` tal cual.
- Actualizar el comentario provisional del helper.

## Archivos

- `packages/schemas/src/user.ts` — modificar: `PasswordSchema`.
- `apps/api/package.json` — modificar: dependencia y script `db:seed`.
- `apps/api/src/auth/password.ts` — crear.
- `apps/api/src/auth/password.test.ts` — crear.
- `apps/api/src/db/seed-admin.ts` — crear.
- `apps/api/src/db/seed-admin.test.ts` — crear.
- `apps/api/src/db/seed.ts` — crear.
- `apps/api/src/test/helpers.ts` — modificar: opción `password`.
- `.env.example`, `docker-compose.yml` — modificar: `ADMIN_*`.
- `apps/api/CLAUDE.md` — modificar: `src/auth/` y `seed` en "Estructura".
- `CLAUDE.md` raíz — modificar: comando `db:seed` en "Comandos".

## Subtareas

- [x] **4.1 — Contraseñas:** dependencia, `PasswordSchema`, `auth/password.ts`, opción `password` en `createUser`. Tests: los de `password.test.ts` y uno de `createUser({ password })`.
- [x] **4.2 — Seed:** `seed-admin.ts`, script `seed.ts`, `db:seed`, `ADMIN_*` en `.env.example` y Compose, documentación. Tests: los de `seed-admin.test.ts`; el script se prueba a mano.

## Tests

Obligatorios (autenticación):

- [x] `hashPassword` devuelve un texto distinto de la contraseña y que empieza por `$argon2id$`.
- [x] Dos hashes de la misma contraseña son distintos (*salt* aleatoria).
- [x] `verifyPassword` con la contraseña correcta → `true`.
- [x] `verifyPassword` con una contraseña incorrecta → `false`.
- [x] `verifyPassword` con un hash malformado (`'not-a-hash'`) → `false`, sin lanzar.
- [x] `createUser({ password })` guarda un hash que `verifyPassword` acepta.
- [x] `seedAdmin` con BD vacía → `'created'`; el usuario es `admin`, activo, con email en minúsculas y contraseña verificable.
- [x] `seedAdmin` dos veces con los mismos datos → la segunda devuelve `'exists'` y sigue habiendo un solo usuario.
- [x] `seedAdmin` con un email ya existente (otro rol, otra contraseña, distinto uso de mayúsculas) → `'exists'` y el usuario no cambia (rol, hash y nombre intactos).

Manual:

- [x] `docker compose exec api pnpm --filter @jarvis/api db:seed` crea el admin; relanzarlo dice que ya existe; sin `ADMIN_EMAIL` sale con error claro y código ≠ 0.

## Conceptos nuevos

- **Hash de contraseñas (argon2id):** función lenta y con mucha memoria a propósito para encarecer los ataques de fuerza bruta si se filtra la BD; distinta de un hash rápido como SHA-256 (válido para tokens aleatorios, no para contraseñas).
- **Salt:** valor aleatorio por hash que hace que dos contraseñas iguales den hashes distintos e inutiliza tablas precalculadas. argon2 la genera y la guarda dentro del propio hash.
- **Seed idempotente:** script de datos iniciales que se puede ejecutar varias veces con el mismo resultado; aquí con `INSERT ... ON CONFLICT DO NOTHING`, que además evita la carrera "comprobar y luego insertar".

## Fuera de alcance

- Login, sesiones y comparación en tiempo constante cuando el usuario no existe → tarea 5.
- Crear usuarios, cambiar y resetear contraseñas desde la API → tarea 7.
- Ejecutar el seed en la imagen `prod` → al desplegar (igual que las migraciones).

## Registro de implementación

### 4.1 — Contraseñas

- Archivos: `apps/api/package.json` (dep. `@node-rs/argon2`), `pnpm-lock.yaml`, `packages/schemas/src/user.ts` (`PasswordSchema`), `apps/api/src/auth/password.ts` y `password.test.ts` (creados), `apps/api/src/test/helpers.ts` (opción `password`), `apps/api/src/test/test-infra.test.ts` (test de `createUser({ password })`).
- Sin desviaciones. El test de `createUser({ password })` va en `test-infra.test.ts`, junto a los demás del helper.
- A mirar: `createUser` saca `password` por desestructuración para que no llegue a `values()`. Imagen reconstruida (`--build -V`); los tests pasan también dentro del contenedor (binario musl de argon2).

### 4.2 — Seed

- Archivos: `apps/api/src/db/seed-admin.ts`, `seed-admin.test.ts` y `seed.ts` (creados), `apps/api/package.json` (script `db:seed`), `.env.example` y `docker-compose.yml` (`ADMIN_*`), `apps/api/CLAUDE.md` (Estructura: seed y `src/auth/`), `CLAUDE.md` raíz (comando `db:seed`).
- Sin desviaciones.
- Prueba manual en el contenedor (con `-e ADMIN_*`, sin tocar `.env`): sin variables → mensaje de Zod y código 1; primera vez → `Admin creado`; segunda (otras mayúsculas y otra contraseña) → `Ya existe…`, código 0; en BD queda admin activo con hash `$argon2id$`. Usuario de prueba borrado después.
- A mirar: los mensajes del script muestran `ADMIN_EMAIL` tal como viene en el entorno, no normalizado (en la BD sí va en minúsculas). `api` recreado con `docker compose up -d` para que reciba las nuevas variables.

## Revisión

Resultado: lista para terminar

Especificación y tests cumplidos; format, typecheck, lint y tests (26) en verde. Sin bloqueantes ni recomendables.

- [x] **R1 · opcional · trivial · `.env.example:13`** (aceptada) — `ADMIN_PASSWORD` se queda en el `.env` y en el entorno del contenedor `api` para siempre, aunque solo sirve una vez → añadir al comentario que se puede vaciar tras el seed (el seed nunca la vuelve a usar sobre un admin existente). Reduce dónde vive un secreto que ya no hace falta.
- [x] **R2 · opcional · trivial · `apps/api/src/auth/password.test.ts:9`** (aceptada) — `expect(hash.startsWith('$argon2id$')).toBe(true)` → `expect(hash).toMatch(/^\$argon2id\$/)`. Si falla, muestra el hash recibido en lugar de solo `false`.

## Cierre

- Documentado: `apps/api/CLAUDE.md` (Estructura: `src/auth/`, `seed-admin.ts`, `seed.ts`; Tests: cuándo usar `createUser({ password })`), `CLAUDE.md` raíz (comando `db:seed`), `.env.example` (`ADMIN_*`), Notas de `fase-1-plan.md` (helpers de contraseñas, `PasswordSchema`, deuda del seed en `prod`).
- Pendiente para otras tareas: comparación en tiempo constante cuando el usuario no existe (tarea 5); validar con `PasswordSchema` al crear, cambiar y resetear contraseñas (tarea 7); ejecutar el seed en `prod` (al desplegar).

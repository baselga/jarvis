# Tarea 2 — Infra de tests con BD

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo
Los tests de la API pueden usar un Postgres real: una BD `jarvis_test` que se crea y migra sola al lanzar Vitest, se vacía entre tests y nunca puede ser la de desarrollo. Incluye helpers para crear usuarios, sesiones y la app de test, base de los tests obligatorios de auth y permisos (tareas 4–7).

## Decisiones
- **Variable propia `TEST_DATABASE_URL`, nunca `DATABASE_URL`** — un test mal configurado no puede apuntar a la BD de desarrollo por accidente.
- **Salvaguarda: el nombre de la BD debe terminar en `_test`** (si no, el setup aborta antes de tocar nada) — convierte un despiste de configuración en un error ruidoso en vez de en datos perdidos.
- **`jarvis_test` la crea el *globalSetup* de Vitest (`CREATE DATABASE` si no existe), no un script de `docker-entrypoint-initdb.d/`** — los scripts de inicio solo se ejecutan con el volumen vacío; así funciona también con el volumen actual. Se aparta del plan, que hablaba de script de inicio.
- **Tests ejecutables desde el host y desde el contenedor** — `vitest.config.js` carga el `.env` raíz (host → `localhost`); Compose define `TEST_DATABASE_URL` para el servicio `api` (→ `postgres`).
- **Sin paralelismo entre archivos (`fileParallelism: false`)** — todos comparten una BD; si un archivo la vacía mientras otro inserta, hay fallos aleatorios. Una BD por *worker* no compensa con pocos tests.
- **`TRUNCATE ... RESTART IDENTITY CASCADE` en `beforeEach` con las tablas leídas de `pg_tables` (esquema `public`)** — las tablas nuevas (biblioteca) se vacían solas, sin lista a mano. La tabla de migraciones vive en el esquema `drizzle` y no se toca.
- **La lógica de migrar se extrae a una función reutilizable** — la usan el script `db:migrate` y el *globalSetup*, sin duplicarla.
- **Helpers provisionales para contraseña y sesión** — `createUser` guarda un hash de relleno (argon2 llega en la tarea 4) y `createSession` inserta el SHA-256 de un token aleatorio (la tarea 5 lo cambiará por la función real).

## Especificación

### Variables de entorno
- `.env.example`: añadir, en un bloque "Tests", `TEST_DATABASE_URL=postgres://jarvis:cambia-esto@localhost:5432/jarvis_test` con un comentario: se usa desde el host; debe terminar en `_test`.
- `docker-compose.yml`, servicio `api`: `TEST_DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}_test`.
- No va en `EnvSchema` de `config.ts`: la app no la usa, solo los tests.
- El `.env` real del usuario también necesita la línea (recordárselo en el registro; no está versionado).

### Migraciones reutilizables
- `src/db/run-migrations.ts` (crear): `export async function runMigrations(url: string): Promise<void>` con lo que hoy hace `migrate.ts` (conexión `max: 1`, `onnotice` silenciado, `migrationsFolder` resuelto desde el archivo, cierra la conexión siempre). Lanza si falla.
- `src/db/migrate.ts` (modificar): `loadConfig()` + `runMigrations(config.DATABASE_URL)`, log "Migraciones al día", `process.exitCode = 1` si falla. Mismo comportamiento que ahora.

### `src/test/env.ts`
- `export function assertTestDatabaseUrl(url: string | undefined): string`: lanza un error claro si falta (“Falta TEST_DATABASE_URL…”, indicando `.env.example`) o si el nombre de la BD (pathname de la URL) no cumple `/^[a-z0-9_]+_test$/` (“TEST_DATABASE_URL debe apuntar a una BD cuyo nombre termine en _test”). El mismo regex hace seguro interpolar el nombre en `CREATE DATABASE`. Devuelve la URL.
- `export const testDatabaseUrl = () => assertTestDatabaseUrl(process.env.TEST_DATABASE_URL)`.

### `src/test/global-setup.ts` (Vitest `globalSetup`, una vez por ejecución)
1. Obtiene y valida la URL con `testDatabaseUrl()`.
2. Se conecta a la BD `postgres` del mismo servidor (misma URL cambiando el pathname), comprueba `pg_database` y, si no existe, `CREATE DATABASE <nombre>`. Cierra esa conexión.
3. `runMigrations(url)`.

### `src/test/setup.ts` (Vitest `setupFiles`, por archivo de test)
- `beforeEach`: `resetDb()` (vacía las tablas).
- `afterAll`: cierra el pool de la BD de test.

### `src/test/helpers.ts`
- `testDb`: instancia de `createDb(testDatabaseUrl())`, una por archivo (los módulos se aíslan por archivo) y la cierra `setup.ts`.
- `resetDb()`: lee `tablename` de `pg_tables where schemaname = 'public'` y, si hay alguna, `TRUNCATE <todas> RESTART IDENTITY CASCADE` en una sola sentencia (nombres con comillas dobles).
- `buildTestApp()`: `buildApp({ db: testDb })`. Quien la usa hace `app.close()` (no cierra la BD).
- `createUser(overrides?: Partial<{ name; email; role; active }>)`: inserta y devuelve la fila. Por defecto `role: 'adult'`, `active: true`, nombre y email únicos con un contador (`user-1@test.local`, en minúsculas), `passwordHash: 'not-a-hash'`.
- `createSession(userId, { expiresAt? })`: token = 32 bytes aleatorios en `base64url`; guarda `id = sha256(token)` en hex y `expiresAt` (por defecto, ahora + 30 días). Devuelve `{ token, session }`. `expiresAt` permite probar sesiones caducadas en la tarea 5.

### Vitest (`apps/api/vitest.config.js`)
- Al principio, si existe el `.env` raíz (ruta resuelta desde el archivo), `process.loadEnvFile(...)`. Debe **no sobrescribir** variables ya definidas, para que en el contenedor gane la de Compose: comprobarlo; si `loadEnvFile` sobrescribe, cargar solo las que falten.
- `test: { globalSetup: ['src/test/global-setup.ts'], setupFiles: ['src/test/setup.ts'], fileParallelism: false }`, manteniendo `ssr.resolve.conditions`.
- Consecuencia: `pnpm -r test` necesita Postgres levantado (también los tests de `health`, que siguen con BD simulada).

### Documentación
- `CLAUDE.md` raíz, "Comandos": cómo se ejecutan los tests — desde el host `pnpm -r test` (Postgres levantado, `TEST_DATABASE_URL` en `.env`) o en el contenedor `docker compose exec api pnpm --filter @jarvis/api test`; la BD `jarvis_test` se crea y migra sola y se vacía entre tests.
- `apps/api/CLAUDE.md`: en "Estructura", `src/test/` y `src/db/run-migrations.ts`; en "Tests", usar `buildTestApp()` y los helpers con BD real (la BD simulada solo para simular fallos, como en `health`), tablas vacías al empezar cada test, sin paralelismo entre archivos.

## Archivos
- `apps/api/src/db/run-migrations.ts` — crear: `runMigrations(url)`.
- `apps/api/src/db/migrate.ts` — modificar: usa `runMigrations`.
- `apps/api/src/test/env.ts` — crear: validación de `TEST_DATABASE_URL` y salvaguarda `_test`.
- `apps/api/src/test/global-setup.ts` — crear: crea la BD si falta y migra.
- `apps/api/src/test/setup.ts` — crear: `beforeEach` vaciar, `afterAll` cerrar.
- `apps/api/src/test/helpers.ts` — crear: `testDb`, `resetDb`, `buildTestApp`, `createUser`, `createSession`.
- `apps/api/src/test/test-infra.test.ts` — crear: tests de la propia infra.
- `apps/api/vitest.config.js` — modificar: `.env`, `globalSetup`, `setupFiles`, `fileParallelism`.
- `.env.example`, `docker-compose.yml` — modificar: `TEST_DATABASE_URL`.
- `CLAUDE.md`, `apps/api/CLAUDE.md` — modificar: documentación.

Son 12 archivos, pero 4 son cambios de una o dos líneas o de documentación; se mantiene como una sola subtarea porque todo forma un único concepto que no funciona por partes.

## Subtareas
- [x] **2.1 — todo.** Tests: los de abajo.

## Tests
Ninguno es obligatorio según el `CLAUDE.md` (es infraestructura), pero sostienen los que sí lo son.

Automáticos (`src/test/test-infra.test.ts`):
- [x] `assertTestDatabaseUrl(undefined)` → lanza indicando que falta `TEST_DATABASE_URL`.
- [x] `assertTestDatabaseUrl('postgres://u:p@localhost:5432/jarvis')` → lanza (no termina en `_test`).
- [x] `assertTestDatabaseUrl('postgres://u:p@localhost:5432/jarvis_test')` → devuelve la URL.
- [x] `createUser()` inserta un usuario `adult`, activo, con email en minúsculas; dos llamadas dan emails distintos.
- [x] `createUser({ role: 'guest', active: false })` respeta los valores.
- [x] `createSession(user.id)` guarda como `id` el SHA-256 del token devuelto (no el token) y caduca en ~30 días.
- [x] Las tablas están vacías al empezar cada test: un test inserta un usuario y el siguiente cuenta 0 filas en `users`.

Manuales:
- [x] Con `jarvis_test` borrada (`DROP DATABASE jarvis_test`), `pnpm -r test` desde el host la crea, migra y pasa.
- [x] Con un usuario insertado en la BD de desarrollo `jarvis`, tras `pnpm -r test` sigue ahí.
- [x] Con `TEST_DATABASE_URL` apuntando a `jarvis` → los tests abortan con el error de la salvaguarda, sin tocar nada.
- [x] `docker compose exec api pnpm --filter @jarvis/api test` pasa (usa `postgres` como host).
- [x] `pnpm -r typecheck`, `pnpm -r lint` y `pnpm -r test` pasan (incluidos los de `health` y `config`).

## Conceptos nuevos
- **BD de test separada:** un mismo servidor Postgres aloja varias BD independientes; cada conexión apunta a una, y vaciar `jarvis_test` no puede tocar `jarvis`.
- **`globalSetup` vs `setupFiles` en Vitest:** el primero corre una vez por ejecución, en un proceso aparte (crear y migrar la BD); el segundo, dentro de cada archivo de test (hooks como `beforeEach`).
- **`TRUNCATE ... RESTART IDENTITY CASCADE`:** vacía tablas de golpe (mucho más rápido que `DELETE`), reinicia secuencias y arrastra las tablas que las referencian por FK.
- **Aislamiento entre tests:** cada test empieza con la BD vacía y crea lo que necesita, así el orden no importa; con una BD compartida, los archivos deben ir en serie.

## Fuera de alcance
- Hash real de contraseñas en `createUser` (opción `password`) — tarea 4.
- Crear sesiones con la función real de auth en `createSession` — tarea 5.
- Script de inicio de Postgres (`docker-entrypoint-initdb.d/`) — no hace falta con el `globalSetup`.
- Tests en CI — no hay CI en esta fase.

## Registro de implementación
### 2.1 — todo
- **Creados:** `apps/api/src/db/run-migrations.ts`, `apps/api/src/test/{env,global-setup,setup,helpers,test-infra.test}.ts`.
- **Modificados:** `apps/api/src/db/migrate.ts`, `apps/api/vitest.config.js`, `apps/api/tsconfig.build.json`, `.env.example`, `docker-compose.yml`, `CLAUDE.md`, `apps/api/CLAUDE.md`.
- **Desviaciones:**
  - `tsconfig.build.json` excluye también `src/test`: si no, `pnpm build` metería los helpers de test en `dist/` (no estaba en "Archivos").
  - `helpers.ts` exporta además `closeTestDb` para que `setup.ts` cierre el pool (la especificación dice que lo cierra `setup.ts`, pero no cómo).
- **Comprobado:** `process.loadEnvFile` no sobrescribe variables ya definidas (probado con Node 24), así que se llama tal cual.
- **Verificación:** typecheck, lint y 13 tests OK desde el host y en el contenedor; `db:migrate` sigue diciendo "Migraciones al día". Manuales: con `jarvis_test` borrada se crea y migra; un usuario de `jarvis` sobrevive a los tests; con la URL apuntando a `jarvis` aborta con el error de la salvaguarda sin tocar nada.
- **Pendiente del usuario:** añadir `TEST_DATABASE_URL` a su `.env` (no versionado) copiándola de `.env.example`; en la verificación se pasó inline.
- **Para la revisión:** el test de `resetDb` depende del orden de ejecución dentro del archivo (secuencial por defecto en Vitest). El contenedor `api` se recreó (`docker compose up -d api`) para recoger la nueva variable.

### Mejoras de la revisión (R1–R3)
- **R1:** `test-infra.test.ts` — `it.each` con `jarvis-dev_test` y `Jarvis_test`: terminan en `_test` pero el regex los rechaza.
- **R2:** `migrate.ts` — `loadConfig()` fuera del `try`.
- **R3:** `env.ts` exporta `testDatabaseName(url)`; lo usan `assertTestDatabaseUrl` y `global-setup.ts`.
- **Verificación:** Prettier, typecheck, lint y 15 tests OK desde el host.

## Revisión
Resultado: lista para terminar (segunda vuelta: R1–R3 aplicadas y correctas; Prettier, typecheck, lint y 15 tests OK desde el host; sin mejoras nuevas).

- [x] **R1 · recomendable · `apps/api/src/test/test-infra.test.ts:12`** — Solo se prueba un nombre sin `_test`; nada falla si alguien relaja el regex (p. ej. a `/_test$/`), y ese regex es lo que hace seguro el `create database "${dbName}"` interpolado → añadir un caso que termine en `_test` pero con caracteres no permitidos (`jarvis-dev_test` o `Jarvis_test`) y espere el error. El test protege la garantía de seguridad, no solo el sufijo. (aceptada)
- [x] **R2 · opcional · trivial · `apps/api/src/db/migrate.ts:6`** — `loadConfig()` ahora va dentro del `try`, así que un error de configuración se imprime como "Error al aplicar las migraciones" (antes salía el error de config tal cual) → sacar `const config = loadConfig();` antes del `try`. La especificación pedía mismo comportamiento y el mensaje confunde al diagnosticar. (aceptada)
- [x] **R3 · opcional · trivial · `apps/api/src/test/env.ts:13` y `global-setup.ts:9`** — `new URL(url).pathname.slice(1)` duplicado → exportar `testDatabaseName(url)` desde `env.ts` y usarlo en los dos. Una sola forma de leer el nombre que se valida y se interpola. (aceptada)

## Cierre
- **Documentado:** `CLAUDE.md` raíz ("Comandos": tests desde host y contenedor); `apps/api/CLAUDE.md` ("Estructura": `src/test/` y `run-migrations.ts`; "Tests": `buildTestApp`, helpers, BD vacía por test, sin paralelismo); `.env.example` (`TEST_DATABASE_URL`); nota en "Notas" de `fase-1-plan.md` sobre los helpers provisionales. Descripción de la tarea 2 en el plan corregida (*globalSetup* en vez de script de inicio).
- **Pendiente para otras tareas:** tarea 4 → `createUser` con opción `password` y hash argon2 real; tarea 5 → `createSession` con la función real de crear sesión.
- **Fuera del código:** `.env` local ya tiene `TEST_DATABASE_URL`.

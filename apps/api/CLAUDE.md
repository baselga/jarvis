# apps/api — convenciones

API REST del hogar (Fastify + Drizzle + PostgreSQL). No sabe nada de IA.

Este archivo tiene lo que vale para cualquier cambio. Los patrones de cada tema están en `docs/`: lee solo las guías de lo que vayas a tocar.

| Si vas a tocar…                                                                  | Lee                 |
| -------------------------------------------------------------------------------- | ------------------- |
| Esquemas de ruta, validación, cuerpos, OpenAPI, códigos HTTP, errores globales   | `docs/rutas.md`     |
| Sesiones, cookie, token, permisos por fila, «¿soy yo?»                            | `docs/auth.md`      |
| `service.ts`, transacciones, 409 por duplicados, relaciones, acciones con reglas | `docs/servicios.md` |
| Listados: paginación, búsqueda `q`, filtros, relaciones en lote                  | `docs/listados.md`  |
| Tablas, migraciones, reglas en la BD, enums, emails, fechas («hoy»)              | `docs/bd.md`        |

Un endpoint nuevo suele necesitar `rutas.md` y `servicios.md` (y `listados.md` si es un listado).

## Estructura

```
src/server.ts      Arranque: lee config, crea la BD, escucha y cierra limpio (SIGTERM).
src/app.ts         buildApp(): crea la instancia Fastify y registra rutas. Sin puerto.
src/openapi.ts     registerOpenApi(): @fastify/swagger + Swagger UI en /docs (antes que las rutas). Su `transform` añade el 503 a todas las rutas.
src/error-handler.ts errorHandler: manejador global (`setErrorHandler` en `buildApp`). BD caída → 503; 4xx → el de Fastify; resto → 500 genérico.
src/config.ts      Variables de entorno validadas con Zod (fail fast).
src/dates.ts       todayIn(zona, now): el día de `now` en una zona IANA (`YYYY-MM-DD`). `DEFAULT_HOME_TZ`, `isValidTimeZone`.
src/db/client.ts   createDb(): pool `postgres` + Drizzle (con el esquema). Tipos `Db` y `DbOrTx`.
src/db/errors.ts   isUniqueViolation / isForeignKeyViolation / isCheckViolation: detectan los códigos de Postgres (`23505`; `23001` y `23503`; `23514`). `constraintOf(error)` da el nombre de la restricción que saltó. `isDbUnavailable`: fallo de conexión (red, cliente `postgres`, SQLSTATE `08xxx`/`57P0x`/`53300`).
src/db/search.ts   containsPattern(q): patrón `ILIKE` «contiene q» con `%`, `_` y `\` escapados. containsText(col, q): «col contiene q» sin mayúsculas ni tildes (`unaccent`, migración 0003).
src/db/schema/     Tablas Drizzle, un archivo por bloque (`users.ts`, `library.ts`); `index.ts` reexporta.
src/db/run-migrations.ts  runMigrations(url): la usan `migrate.ts` y el setup de tests.
src/db/migrate.ts  Aplica las migraciones pendientes (`pnpm db:migrate`; `dev` lo ejecuta al arrancar).
src/db/seed-admin.ts  seedAdmin(db, datos): crea el primer admin si no existe (idempotente).
src/db/seed.ts     Script `pnpm db:seed`: lee `ADMIN_*` del entorno y llama a seedAdmin.
src/db/sample.ts   Script `pnpm db:sample [--reset]` (solo desarrollo): inserta `sample-data.ts` en una transacción.
                   Sin `--reset` se niega si ya hay datos; con él vacía la biblioteca y los usuarios de ejemplo (no el admin).
src/db/sample-data.ts  Datos de ejemplo (libros, autores, préstamos, lecturas, usuarios): solo datos, fechas como «hace N días».
src/auth/          password.ts (argon2id), session.ts (crear/validar/borrar sesiones opacas),
                   request-token.ts (token de Bearer o cookie, opciones de la cookie),
                   authenticate.ts (plugin `auth`: `app.authenticate`, `requireRole`).
drizzle/           Migraciones SQL generadas por drizzle-kit, versionadas en git.
src/modules/<x>/   Una carpeta por entidad o grupo de rutas: `routes.ts` (plugin Fastify) y `routes.test.ts`
                   (`health`, `auth`, `users`, `authors`, `genres`, `sagas`, `books`, `loans`, `readings`). Con lógica de datos propia lleva también `service.ts`
                   (`authors` es el patrón de referencia).
src/http-errors.ts notFound(msg), badRequest(msg), forbidden(msg), conflict(msg) y serviceUnavailable(msg): errores HTTP compartidos por los módulos.
src/test/          Infra de tests: BD `_test` (env.ts, global-setup.ts, setup.ts) y helpers.
docs/              Guías por tema (ver la tabla de arriba).
```

## Reglas que valen siempre

- **Dependencias inyectadas en `buildApp()`** (hoy la BD y la zona de casa): los tests pasan una simulada. Lo nuevo que dependa de algo externo entra por `BuildAppOptions`, no con imports globales.
- **Rutas como plugin:** `export const xxxRoutes: FastifyPluginAsyncZod = async (app) => { ... }` en `modules/<x>/routes.ts` y `app.register(...)` en `app.ts`. TypeScript infiere `body`/`params`/`query` y lo que se puede devolver a partir del `schema`: no anotes tipos a mano. (`require-await` está desactivada en `modules/**/routes.ts`, ver `eslint.config.js`).
- **Cada ruta con `schema`:** `tags`, `summary`, `body`/`params`/`querystring` y `response` con **todos** los códigos que devuelve; los errores con `ErrorResponseSchema` de `@jarvis/schemas`. Ver `src/modules/health/routes.ts`.
- **Rutas protegidas:** en el plugin de rutas, `app.addHook('onRequest', app.authenticate)` protege todo lo que registre (401 si no hay sesión válida; deja `request.user` y renueva la cookie). Por ruta, `preHandler: requireRole('admin', 'adult')` con la lista explícita de roles (403), sin jerarquía. En el `schema`: `security: sessionSecurity` y `response: { 200: X, ...authErrorResponses }` (solo `401` si no hay `requireRole`), ambos de `auth/authenticate.ts`. Si el plugin mezcla rutas públicas, `onRequest: app.authenticate` por ruta (como `/auth/me`).
- **Ruta → servicio:** la ruta valida, comprueba permisos y traduce a HTTP; el SQL va en `service.ts`. Detalle en `docs/servicios.md`.
- **Acceso a la BD con `app.db`** (decorador de Fastify), nunca creando otro cliente.
- **Tipos de petición/respuesta desde `@jarvis/schemas`**, no definidos aquí.
- **Variables de entorno nuevas:** añadirlas a `EnvSchema` en `config.ts`, a `.env.example` y, si Compose las pasa, a `docker-compose.yml`.

## Tests

- Vitest, archivo junto al código (`foo.ts` → `foo.test.ts`).
- Peticiones con `app.inject()` sobre `buildTestApp()` (de `src/test/helpers.ts`; acepta las opciones de `buildApp` salvo `db`, p. ej. `{ cookieSecure: true }`); sin abrir puertos.
- BD real (`TEST_DATABASE_URL`, nombre acabado en `_test`) con los helpers `createUser` y `createSession`. Las reglas de la BD (`check`, `RESTRICT`…) se prueban con `expectPgCode(promise, código)`, ver `db/schema/*.test.ts`. `createUser({ password })` solo si el test hace login (argon2 es lento). La BD simulada solo para simular fallos, como en `health.test.ts`.
- Cada test empieza con las tablas vacías (`beforeEach` en `src/test/setup.ts`): crea lo que necesites en el propio test.
- Sin paralelismo entre archivos (comparten BD).
- Ejecutar: `pnpm --filter @jarvis/api test` (Postgres levantado).

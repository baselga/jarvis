# apps/api — convenciones

API REST del hogar (Fastify + Drizzle + PostgreSQL). No sabe nada de IA.

## Estructura

```
src/server.ts      Arranque: lee config, crea la BD, escucha y cierra limpio (SIGTERM).
src/app.ts         buildApp(): crea la instancia Fastify y registra rutas. Sin puerto.
src/openapi.ts     registerOpenApi(): @fastify/swagger + Swagger UI en /docs (antes que las rutas).
src/config.ts      Variables de entorno validadas con Zod (fail fast).
src/db/client.ts   createDb(): pool `postgres` + Drizzle (con el esquema).
src/db/schema/     Tablas Drizzle, un archivo por bloque (`users.ts`); `index.ts` reexporta.
src/db/run-migrations.ts  runMigrations(url): la usan `migrate.ts` y el setup de tests.
src/db/migrate.ts  Aplica las migraciones pendientes (`pnpm db:migrate`; `dev` lo ejecuta al arrancar).
drizzle/           Migraciones SQL generadas por drizzle-kit, versionadas en git.
src/routes/*.ts    Un plugin por grupo de rutas.
src/test/          Infra de tests: BD `_test` (env.ts, global-setup.ts, setup.ts) y helpers.
```

## Patrones

- **Dependencias inyectadas en `buildApp()`** (hoy la BD): los tests pasan una simulada. Lo nuevo que dependa de algo externo entra por `BuildAppOptions`, no con imports globales.
- **Rutas como plugin:** `export const xxxRoutes: FastifyPluginAsyncZod = async (app) => { ... }` en `routes/` y `app.register(...)` en `app.ts`. TypeScript infiere `body`/`params`/`query` y lo que se puede devolver a partir del `schema`: no anotes tipos a mano. (`require-await` está desactivada en `routes/**`, ver `eslint.config.js`).
- **Cada ruta con `schema`:** `tags`, `summary`, `body`/`params`/`querystring` y `response` con **todos** los códigos que devuelve; los errores con `ErrorResponseSchema` de `@jarvis/schemas`. Ver `src/routes/health.ts`.
- **Se valida también la respuesta:** las claves que no estén en el esquema se eliminan en silencio (no se filtran, p. ej. `passwordHash`); si falta un campo o no encaja su tipo, 500. Si un `return` convive con `reply.send(...)`, usa `as const` en el literal para que TS no ensanche los enums.
- **Documentación:** Swagger UI en `/docs`, documento OpenAPI en `/docs/json`, generados desde los esquemas Zod.
- **Acceso a la BD con `app.db`** (decorador de Fastify), nunca creando otro cliente.
- **Tipos de petición/respuesta desde `@jarvis/schemas`**, no definidos aquí.
- **Variables de entorno nuevas:** añadirlas a `EnvSchema` en `config.ts`, a `.env.example` y, si Compose las pasa, a `docker-compose.yml`.
- **Cambiar el modelo:** editar `src/db/schema/` → `pnpm --filter @jarvis/api db:generate` → revisar el SQL de `drizzle/` → se aplica al reiniciar `api` (`docker compose restart api`). Las migraciones ya commiteadas no se editan.
- **Enums de Postgres desde Zod:** `pgEnum('x', XSchema.enum)` (no `.options`: en Zod 4 no es tupla). Ver `src/db/schema/users.ts`.
- **Códigos HTTP con intención:** 503 si falla una dependencia (BD), no 500.

## Tests

- Vitest, archivo junto al código (`foo.ts` → `foo.test.ts`).
- Peticiones con `app.inject()` sobre `buildTestApp()` (de `src/test/helpers.ts`); sin abrir puertos.
- BD real (`TEST_DATABASE_URL`, nombre acabado en `_test`) con los helpers `createUser` y `createSession`. La BD simulada solo para simular fallos, como en `health.test.ts`.
- Cada test empieza con las tablas vacías (`beforeEach` en `src/test/setup.ts`): crea lo que necesites en el propio test.
- Sin paralelismo entre archivos (comparten BD).
- Ejecutar: `pnpm --filter @jarvis/api test` (Postgres levantado).

## Pendiente de decidir (fase 1)

Estructura de módulos cuando haya varias entidades (tarea 9).

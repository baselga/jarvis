# apps/api — convenciones

API REST del hogar (Fastify + Drizzle + PostgreSQL). No sabe nada de IA.

## Estructura

```
src/server.ts      Arranque: lee config, crea la BD, escucha y cierra limpio (SIGTERM).
src/app.ts         buildApp(): crea la instancia Fastify y registra rutas. Sin puerto.
src/config.ts      Variables de entorno validadas con Zod (fail fast).
src/db/client.ts   createDb(): pool `postgres` + Drizzle (con el esquema).
src/db/schema/     Tablas Drizzle, un archivo por bloque (`users.ts`); `index.ts` reexporta.
src/db/migrate.ts  Aplica las migraciones pendientes (`pnpm db:migrate`; `dev` lo ejecuta al arrancar).
drizzle/           Migraciones SQL generadas por drizzle-kit, versionadas en git.
src/routes/*.ts    Un plugin por grupo de rutas.
```

## Patrones

- **Dependencias inyectadas en `buildApp()`** (hoy la BD): los tests pasan una simulada. Lo nuevo que dependa de algo externo entra por `BuildAppOptions`, no con imports globales.
- **Rutas como plugin:** `export function xxxRoutes(app: FastifyInstance)` en `routes/` y `app.register(...)` en `app.ts`.
- **Acceso a la BD con `app.db`** (decorador de Fastify), nunca creando otro cliente.
- **Tipos de petición/respuesta desde `@jarvis/schemas`**, no definidos aquí.
- **Variables de entorno nuevas:** añadirlas a `EnvSchema` en `config.ts`, a `.env.example` y, si Compose las pasa, a `docker-compose.yml`.
- **Cambiar el modelo:** editar `src/db/schema/` → `pnpm --filter @jarvis/api db:generate` → revisar el SQL de `drizzle/` → se aplica al reiniciar `api` (`docker compose restart api`). Las migraciones ya commiteadas no se editan.
- **Enums de Postgres desde Zod:** `pgEnum('x', XSchema.enum)` (no `.options`: en Zod 4 no es tupla). Ver `src/db/schema/users.ts`.
- **Códigos HTTP con intención:** 503 si falla una dependencia (BD), no 500.

## Tests

- Vitest, archivo junto al código (`foo.ts` → `foo.test.ts`).
- Peticiones con `app.inject()` sobre `buildApp()`; sin abrir puertos.
- Ejecutar: `pnpm --filter @jarvis/api test`.

## Pendiente de decidir (fase 1)

Integración Zod ↔ Fastify para validar y generar OpenAPI, y estructura de módulos cuando haya varias entidades.

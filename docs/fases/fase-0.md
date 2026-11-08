# Fase 0 — Esqueleto (terminada)

Monorepo pnpm con una API Fastify mínima conectada a PostgreSQL, todo corriendo en Docker Compose. Plan detallado: `fase-0-plan.md`.

## Qué hay construido

- **Raíz:** `pnpm-workspace.yaml`, `tsconfig.base.json` (ESM + estricto), `eslint.config.js` (flat config + typescript-eslint + prettier), `.prettierrc`, `.nvmrc` (Node 24).
- **`packages/schemas`** (`@jarvis/schemas`): Zod. De momento solo `HealthResponseSchema` y su tipo (`src/health.ts`). Exporta `src/` con la condición `development` y `dist/` en el resto.
- **`apps/api`** (`@jarvis/api`):
  - `src/config.ts` — variables de entorno validadas con Zod; si falta `DATABASE_URL` o algo es inválido, no arranca.
  - `src/app.ts` — `buildApp()` crea la instancia Fastify (testeable sin puerto); `src/server.ts` solo la arranca.
  - `src/db/client.ts` — cliente Drizzle sobre `postgres`; la conexión se cierra en el hook `onClose`.
  - `src/routes/health.ts` — `GET /health`: `SELECT 1` → 200 `{ status: "ok", db: "up" }` o 503 `{ db: "down" }`.
  - `Dockerfile` multi-stage (`dev` con `tsx watch`, `prod` con `tsc` + `node dist`).
- **`docker-compose.yml`:** `postgres:18-alpine` (volumen, healthcheck, puerto solo en `127.0.0.1`) y `api` (código montado, espera a que la BD esté sana).
- **Tablas:** ninguna todavía.
- **Tests (5, Vitest + `fastify.inject()`):** `/health` OK, `/health` con BD caída (conexión simulada) y validación de config.

## Decisiones y porqué

- **Docker también en desarrollo:** el mismo entorno siempre; no hay salto "local → Docker".
- **`node_modules` como volúmenes anónimos** en el contenedor: los binarios se compilan para Linux y no se pisan con los del Mac.
- **Condición `development` en `exports`:** `tsx` y Vitest leen `@jarvis/schemas` desde `src/` sin compilarlo; en producción se usa `dist/`.
- **`buildApp()` separado de `server.ts`:** permite testear con `inject()` sin abrir puertos.
- **`/health` comprueba la BD:** sirve para healthchecks de Docker/Caddy más adelante.
- **Solo se crean las apps de la fase actual**; `assistant`, `web` y `api-client` llegan en su fase.

## Comandos nuevos

- `pnpm format` / `pnpm format:check` — Prettier.
- `docker compose up -d --build -V` — tras cambiar dependencias (reconstruye y renueva los `node_modules` del contenedor).
- `.env` se crea copiando `.env.example` (`POSTGRES_*`, `LOG_LEVEL`). `DATABASE_URL` la monta Compose.

## Pendientes y deuda técnica

- Sin migraciones de Drizzle todavía (`drizzle-kit` llega con la primera tabla).
- Imagen `prod` del Dockerfile sin probar en serio (se usará en la fase 3 con Caddy).
- `packages/schemas` no tiene tests (solo hay un esquema trivial).

## Conceptos de backend aprendidos

- Validar la configuración al arrancar (*fail fast*).
- Separar construcción de la app y arranque del servidor para testear.
- `fastify.inject()`: peticiones simuladas en tests.
- Healthcheck con dependencia real (BD) y código 503 cuando algo cae.
- Ciclo de vida: cerrar conexiones en `onClose` para un apagado limpio.
- Docker multi-stage, redes de Compose (el host `postgres`), `depends_on` con `service_healthy`.
- Resolución de paquetes con condiciones de `exports` en un monorepo.

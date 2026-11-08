# Fase 0 — Esqueleto: plan

## Decisiones

- **Todo en Docker Compose, también en desarrollo.** La API corre en un contenedor Node 24 con el código montado como volumen y `tsx watch` (recarga al guardar). Así no hay salto de "local" a "Docker" más adelante.
- **Dockerfile multi-stage** (`dev` y `prod`): la fase 3 reutiliza el de producción sin rehacerlo.
- **ESM + TypeScript estricto**, con `tsconfig.base.json` compartido. `tsx` en desarrollo, `tsc` para compilar.
- **Solo `apps/api` y `packages/schemas`.** `assistant`, `web` y `api-client` se crean en su fase, para no mantener carpetas vacías.
- **`/health` comprueba la BD** con `SELECT 1` vía Drizzle (todavía sin tablas) y devuelve `{ status, db }`. Su esquema Zod vive en `packages/schemas`.
- **ESLint (flat config + typescript-eslint) + Prettier, y Vitest:** herramientas ya conocidas del front.
- **Tests de endpoints con `fastify.inject()`**: peticiones simuladas sin abrir un puerto real.

## Tareas

1. [x] **Monorepo base:** `package.json` raíz, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.nvmrc` (Node 24) y scripts `typecheck`, `test` y `lint`.
2. [x] **Lint y formato:** ESLint flat config con typescript-eslint, Prettier y `.prettierrc`.
3. [x] **`packages/schemas`:** paquete con Zod y `HealthResponseSchema` (más su tipo inferido).
4. [x] **`apps/api` mínima:** Fastify con logger, configuración de entorno validada con Zod (falla al arrancar si falta algo), `buildApp()` separado de `server.ts` para poder testear, y `/health` sin BD. Test: `/health` responde 200 con un cuerpo que cumple el esquema.
5. [x] **Conexión a BD:** cliente Drizzle con `postgres`, `/health` con `SELECT 1` (devuelve `db: "down"` y 503 si falla) y cierre de la conexión al parar la app. Test: BD caída → 503 (con la conexión simulada).
6. [x] **Docker:** `Dockerfile` multi-stage, `docker-compose.yml` (postgres con volumen y healthcheck, api con volumen de código y `depends_on: service_healthy`), `.env.example` y `.dockerignore`. Verificación: `docker compose up -d` y `curl localhost:3000/health` → `{ status: "ok", db: "up" }`.

## Tests

- Tarea 4: `/health` OK.
- Tarea 5: `/health` con la BD caída.
- Esta fase no toca auth, roles ni permisos, así que no lleva tests obligatorios.

## Terminada cuando

- `docker compose up -d` levanta `postgres` y `api` sin errores.
- `GET /health` responde 200 `{ status: "ok", db: "up" }`.
- `pnpm -r typecheck`, `pnpm -r test` y `pnpm -r lint` pasan.

# Jarvis

Asistente doméstico tipo Alexa con IA, alojado en un servidor en casa. Proyecto personal: prioriza que funcione bien para una familia y que sirva para aprender backend con TypeScript. Nada de escalado ni aspectos comerciales.

Objetivos, arquitectura y fases completos: `docs/PLAN.md` (léelo solo al empezar una fase, no en cada tarea).
Estado del proyecto: `docs/fases/fase-N.md` (un resumen por fase terminada).
Deuda técnica y mejoras pendientes: `docs/deuda.md` (apunta ahí lo que se deja para más adelante).
Fase activa: 1 (plan: `docs/fases/fase-1-plan.md`)
Tarea activa: ninguna (siguiente: 16)

## Forma de trabajar

- Cada fase empieza con `/jarvis-phase N`: entrevista → resumen → mi confirmación → plan de tareas. No implementes nada de una fase sin ese acuerdo.
- Cada tarea del plan pasa por `/jarvis-spec` → `/jarvis-implement` → `/jarvis-review` → `/jarvis-finish`, en sesiones separadas que se comunican por `docs/fases/fase-F/tarea-N.md`. El número de tarea es opcional: se toma de `Tarea activa`. Commit al terminar cada tarea (y, si `/jarvis-finish` abrió PR, mergearlo) antes de la siguiente.
- No hagas commits salvo que te lo pida expresamente (confirmar el commit/PR que propone `/jarvis-finish` cuenta); como mucho, propón el mensaje.
- Estoy aprendiendo backend (vengo de front con React + Vite): explica el porqué de las decisiones importantes, de forma breve. Las explicaciones largas van al resumen de la fase, no en cada cambio.
- Tareas pequeñas y revisables. Si una tarea crece, para y propón dividirla.
- Responde en español.

## Stack

- Monorepo: pnpm workspaces
- Backend: Node + Fastify + Zod · ORM: Drizzle · BD: PostgreSQL
- IA: Vercel AI SDK (tool calling, streaming, proveedor intercambiable)
- Front: React + Vite + TanStack Query
- Infra: Docker Compose + Caddy · Voz (futuro): Python en `voice/`

## Estructura

```
apps/api/          API hogar: datos, usuarios, auth, roles. No sabe nada de IA.
apps/assistant/    LLM, memoria, herramientas (llamadas a la API).
apps/web/          React: /chat y /gestion, un único login.
packages/schemas/  Zod: fuente de verdad de entidades y DTOs.
packages/api-client/ Cliente tipado de la API.
voice/             (fase 6) satélite de voz en Python.
```

Hoy solo existen `apps/api` y `packages/schemas`; el resto se crea en su fase. Cada app tiene su propio `CLAUDE.md` con sus convenciones. Glosario del hogar (miembros, roles, entidades): `docs/dominio.md` (desde la fase 1).

### Añadir una app o paquete al monorepo

Nada avisa si se olvida alguno de estos pasos:

1. Dependencia interna con `"@jarvis/x": "workspace:*"`; si es un paquete, `exports` con la condición `development` apuntando a `src/` (como `packages/schemas`).
2. `COPY <ruta>/package.json <ruta>/` en la etapa `deps` de cada `Dockerfile` que lo use.
3. Volumen anónimo `/app/<ruta>/node_modules` en el servicio de `docker-compose.yml`.
4. Un `CLAUDE.md` en la carpeta de la app con sus convenciones.

## Reglas de arquitectura

- Los tipos salen de `packages/schemas`; no dupliques tipos a mano en apps.
- El asistente llama a la API **siempre con el token del usuario**, nunca con credenciales de admin, para que se apliquen sus permisos.
- Roles: `admin`, `adult`, `guest` (admin, adulto, invitado). Los permisos se comprueban en la API, no en el front ni en el asistente.
- Todo corre en Docker Compose desde el primer día.
- Secretos solo en `.env` (no versionado); mantén `.env.example` al día.

## Tests

Obligatorios en: autenticación y roles, permisos por endpoint (p. ej. un invitado no puede borrar) y herramientas del asistente. En el resto, a criterio y acordado en la entrevista de la fase.

## Comandos

- `docker compose up -d` — levanta todo
- `docker compose up -d --build -V` — tras cambiar dependencias
- `pnpm format` — Prettier
- `pnpm -r typecheck` — tipos
- `pnpm -r test` — tests desde el host (Postgres levantado y `TEST_DATABASE_URL` en `.env`); en el contenedor: `docker compose exec api pnpm --filter @jarvis/api test`. La BD `jarvis_test` se crea y migra sola y se vacía entre tests.
- `pnpm -r lint` — lint; `pnpm -r lint --fix` ordena los imports (y corrige lo demás que tenga autofix)
- `docker compose exec api pnpm --filter @jarvis/api db:seed` — crea el primer admin con `ADMIN_*` del `.env` (no toca uno existente)

Verifica con estos comandos tras cada tarea y muestra solo los errores, no la salida completa.

## Ahorro de contexto

- Lee solo los archivos necesarios; usa la estructura de arriba para ir directo.
- No vuelvas a leer archivos que acabas de editar.
- Al cerrar una fase, escribe `docs/fases/fase-N.md` para poder empezar la siguiente con contexto limpio.
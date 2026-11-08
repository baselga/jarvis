# Jarvis

Asistente doméstico tipo Alexa con IA, alojado en un servidor en casa. Proyecto personal: prioriza que funcione bien para una familia y que sirva para aprender backend con TypeScript. Nada de escalado ni aspectos comerciales.

Objetivos, arquitectura y fases completos: `docs/PLAN.md` (léelo solo al empezar una fase, no en cada tarea).
Estado del proyecto: `docs/fases/fase-N.md` (un resumen por fase terminada).

## Forma de trabajar

- Cada fase empieza con `/fase N`: entrevista → resumen → mi confirmación → implementación. No implementes nada de una fase sin ese acuerdo.
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
voice/             (fase 5) satélite de voz en Python.
```

## Reglas de arquitectura

- Los tipos salen de `packages/schemas`; no dupliques tipos a mano en apps.
- El asistente llama a la API **siempre con el token del usuario**, nunca con credenciales de admin, para que se apliquen sus permisos.
- Roles: `admin`, `adulto`, `invitado`. Los permisos se comprueban en la API, no en el front ni en el asistente.
- Todo corre en Docker Compose desde el primer día.
- Secretos solo en `.env` (no versionado); mantén `.env.example` al día.

## Tests

Obligatorios en: autenticación y roles, permisos por endpoint (p. ej. un invitado no puede borrar) y herramientas del asistente. En el resto, a criterio y acordado en la entrevista de la fase.

## Comandos

<!-- Completar en la fase 0 con los reales -->
- `docker compose up -d` — levanta todo
- `docker compose up -d --build -V` — tras cambiar dependencias
- `pnpm format` — Prettier
- `pnpm -r typecheck` — tipos
- `pnpm -r test` — tests
- `pnpm -r lint` — lint

Verifica con estos comandos tras cada tarea y muestra solo los errores, no la salida completa.

## Ahorro de contexto

- Lee solo los archivos necesarios; usa la estructura de arriba para ir directo.
- No vuelvas a leer archivos que acabas de editar.
- Al cerrar una fase, escribe `docs/fases/fase-N.md` para poder empezar la siguiente con contexto limpio.
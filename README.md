# Jarvis

Asistente doméstico con IA que conoce los datos de casa (libros, compra, tareas, recetas) y se aloja en un servidor propio. Objetivos y fases: [`docs/PLAN.md`](docs/PLAN.md). Estado: [`docs/fases/`](docs/fases/).

## Requisitos

- Docker con Docker Compose.
- Node 24 (`.nvmrc`) y pnpm (`corepack enable`) en el host, para el editor, tipos y tests.

## Arrancar

```sh
cp .env.example .env        # y cambia POSTGRES_PASSWORD
pnpm install                # dependencias en el host (editor, typecheck, tests)
docker compose up -d        # Postgres + API
curl localhost:3000/health  # → {"status":"ok","db":"up"}
```

Tras cambiar dependencias: `docker compose up -d --build -V`.

## Comandos

| Comando               | Qué hace          |
| --------------------- | ----------------- |
| `pnpm -r typecheck`   | Comprueba tipos   |
| `pnpm -r test`        | Tests (Vitest)    |
| `pnpm -r lint`        | ESLint            |
| `pnpm format`         | Prettier          |
| `docker compose logs -f api` | Logs de la API |

## Estructura

```
apps/api/          API REST del hogar (Fastify + Drizzle + PostgreSQL)
packages/schemas/  Esquemas Zod compartidos (fuente de verdad de los tipos)
docs/              Plan del proyecto y resumen de cada fase
```

Las apps `assistant`, `web` y el paquete `api-client` se crean en su fase.

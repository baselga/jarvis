# @jarvis/api

```text
        ▄▄▄▄
       ██▀▀██
        ▀██▀
 █▀▄  ▄▄▄██▄▄▄  ▄▀█     @jarvis/api
 █  ▀▀        ▀▀  █
▄▀                ▀▄    API REST del hogar: usuarios, roles
█   ▄█         ▄█  █    y los datos de casa (la biblioteca).
█   ▀▀  ▄  ▄   ▀▀  █
█        ▀▀        █    Fastify · Zod · Drizzle · PostgreSQL
 ▀▄              ▄▀
   ▀▀▄▄▄▄▄▄▄▄▄▄▀▀
```

API REST del hogar: usuarios, roles y los datos de casa (hoy, la biblioteca). No sabe nada de IA; la web y el asistente la usan igual, cada uno con la sesión de su usuario.

Fastify + Zod para las rutas, Drizzle + PostgreSQL para los datos, Vitest para los tests.

## Arrancar y probar

Desde la raíz del monorepo:

```sh
docker compose up -d                                         # Postgres + API (aplica las migraciones al arrancar)
curl localhost:3000/health                                   # → {"status":"ok","db":"up"}
docker compose exec api pnpm --filter @jarvis/api db:seed    # primer admin, con ADMIN_* del .env
docker compose exec api pnpm --filter @jarvis/api db:sample  # datos de ejemplo (solo desarrollo)
```

- **Swagger UI:** <http://localhost:3000/docs>. Documenta y deja probar todos los endpoints; el OpenAPI en JSON está en `/docs/json`.
- **Datos de ejemplo:** `db:sample` crea unas decenas de libros con autores, géneros, sagas, préstamos y lecturas, y dos usuarios: `adulto@jarvis.local` e `invitado@jarvis.local` (contraseña `jarvis-dev`). Se niega si ya hay datos; `--reset` los regenera sin tocar al admin. No se ejecuta con `NODE_ENV=production`.

### Autenticarse

`POST /auth/login` devuelve `{ user, token }` y además deja la cookie de sesión. Desde el navegador (y Swagger UI) basta con la cookie; desde `curl` u otro cliente, manda el token como `Authorization: Bearer <token>`.

```sh
TOKEN=$(curl -s localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"adulto@jarvis.local","password":"jarvis-dev"}' | jq -r .token)
curl -s localhost:3000/books?q=garcia -H "authorization: Bearer $TOKEN"
```

## Scripts

Se ejecutan con `pnpm --filter @jarvis/api <script>`; los de BD, dentro del contenedor (`docker compose exec api …`).

| Script        | Qué hace                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `dev`         | Aplica las migraciones y arranca con recarga (`tsx watch`). Es lo que ejecuta el contenedor.       |
| `build`       | Compila a `dist/`.                                                                                 |
| `start`       | Arranca la versión compilada.                                                                      |
| `db:generate` | Genera la migración SQL a partir de los cambios en `src/db/schema/` (revísala antes de commitear). |
| `db:migrate`  | Aplica las migraciones pendientes.                                                                 |
| `db:seed`     | Crea el primer admin con `ADMIN_*`; si ya existe, no lo toca.                                      |
| `db:sample`   | Datos de ejemplo (`--reset` para regenerarlos). Solo desarrollo.                                   |
| `test`        | Tests con Vitest contra la BD `jarvis_test` (Postgres levantado).                                  |
| `typecheck`   | Comprueba tipos.                                                                                   |
| `lint`        | ESLint.                                                                                            |

## Variables de entorno

Se validan al arrancar (`src/config.ts`): si falta una obligatoria o tiene un valor inválido, la API no arranca. Las de ejemplo están en `.env.example` de la raíz.

| Variable            | Para qué                                                                    | Por defecto              |
| ------------------- | --------------------------------------------------------------------------- | ------------------------ |
| `DATABASE_URL`      | Conexión a Postgres. En Docker la monta Compose a partir de `POSTGRES_*`.    | — (obligatoria)          |
| `HOME_TZ`           | Zona horaria de casa: decide qué día es «hoy» en las fechas por defecto.    | `Europe/Madrid`          |
| `LOG_LEVEL`         | Nivel de log (`fatal`…`trace`).                                             | `info`                   |
| `NODE_ENV`          | `development`, `test` o `production`. En producción la cookie va con `Secure`. | `development`        |
| `HOST` / `PORT`     | Dónde escucha.                                                              | `0.0.0.0` / `3000`       |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Solo para `db:seed`.                              | —                        |
| `TEST_DATABASE_URL` | BD de los tests desde el host; su nombre debe acabar en `_test`.            | —                        |

## Endpoints

Todos piden sesión salvo `/health` y `/auth/login`. El detalle (parámetros, respuestas, errores) está en `/docs`; las reglas del hogar, en [`docs/dominio.md`](../../docs/dominio.md).

| Módulo                                   | Rutas                                                                                       | Quién                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Salud                                    | `GET /health`                                                                               | Cualquiera, sin sesión                                                 |
| Sesión                                   | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`                                     | Cualquiera                                                             |
| Mi cuenta                                | `PATCH /auth/me` (nombre), `PUT /auth/password`                                             | admin, adulto                                                          |
| Usuarios                                 | `GET/POST /users`, `GET/PATCH /users/:id`, `PUT /users/:id/password`                        | admin                                                                  |
| Autores, géneros, sagas                  | `GET/POST /authors`, `GET/PATCH/DELETE /authors/:id` (igual con `/genres` y `/sagas`)       | Leer: todos · escribir: admin, adulto                                  |
| Libros                                   | `GET/POST /books`, `GET/PATCH/DELETE /books/:id`                                            | Leer: todos · escribir: admin, adulto                                  |
| Préstamos                                | `GET /loans/active`, `GET/POST /books/:id/loans`, `POST /loans/:id/return`, `PATCH/DELETE /loans/:id` | Leer: todos · escribir: admin, adulto                        |
| Lecturas                                 | `GET /readings`, `POST /books/:id/readings`, `PATCH/DELETE /readings/:id`                   | Leer: todos · escribir las **propias**: admin, adulto                  |

## Más

- [`docs/backend.md`](../../docs/backend.md): cómo está hecha por dentro y por qué.
- [`docs/api-contrato.md`](../../docs/api-contrato.md): lo que necesita saber quien la consume (web, asistente).
- [`CLAUDE.md`](CLAUDE.md) y [`docs/`](docs/): convenciones para programar en ella.

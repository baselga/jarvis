# Fase 1 — API hogar: biblioteca (terminada)

API con usuarios, roles, sesiones y la biblioteca de casa (libros, autores, géneros, sagas, préstamos y lecturas), documentada en `/docs` y con 389 tests contra Postgres real. Plan, decisiones y notas por tarea: `fase-1-plan.md`; detalle de cada tarea: `fase-1/tarea-N.md`.

## Qué hay construido

- **Tablas** (`apps/api/src/db/schema/`, migraciones en `apps/api/drizzle/`): `users`, `sessions`, `books`, `authors`, `book_authors`, `genres`, `book_genres`, `sagas`, `loans`, `readings`. Extensión `unaccent`.
- **Módulos** (`apps/api/src/modules/<x>/` con `routes.ts` + `service.ts` + `routes.test.ts`): `auth`, `users`, `authors`, `genres`, `sagas`, `books`, `loans`, `readings`, `health`. Tabla de endpoints y quién puede cada uno: `apps/api/README.md`.
- **Piezas transversales** (`apps/api/src/`): `auth/` (argon2, sesiones, `authenticate` + `requireRole`), `error-handler.ts` (BD caída → 503, 500 sin detalle), `openapi.ts` (Swagger UI en `/docs`), `dates.ts` (`app.today()` en `HOME_TZ`), `db/errors.ts` y `db/search.ts` (`containsText`: sin mayúsculas ni tildes).
- **`packages/schemas`:** entidades y DTOs de todo lo anterior; validan, tipan y generan el OpenAPI.
- **Scripts:** `db:seed` (primer admin) y `db:sample [--reset]` (biblioteca de ejemplo + usuarios adulto e invitado).
- **Docs:** `docs/api-contrato.md` (para la web y el asistente), `docs/dominio.md` (roles, entidades, tabla de permisos), `docs/backend.md` (cómo está hecho), `apps/api/CLAUDE.md` + `apps/api/docs/` (convenciones por tema).

## Decisiones y porqué

- **Sesiones opacas en BD hechas a mano** (hash SHA-256 del token, 30 días deslizantes), cookie para la web y `Bearer` para el asistente: revocables al instante y sin librería que esconda cómo funciona.
- **Permisos solo en la API:** `authenticate` (401) + `requireRole` (403) por ruta; las lecturas, además, por fila (solo el dueño, ni el admin).
- **Reglas en Postgres** (únicos, `CHECK`, índice único parcial «un préstamo activo por libro», email en minúsculas) y el servicio traduce el error a un resultado explícito; la ruta lo pasa a HTTP.
- **Ruta y servicio separados, resultados explícitos** en vez de excepciones para lo previsto.
- **Usuarios desactivados, no borrados; sin registro** (el admin da de alta; los invitados comparten cuenta).
- **Tests contra `jarvis_test` real**, no mocks: las reglas viven en la BD.
- **CRUD de autores/géneros/sagas duplicado a propósito** hasta que haya una cuarta entidad «solo nombre».
- **Bloque 1c:** lo que la web o el asistente necesitarán de la API se hizo ya (503, búsqueda sin tildes, `PATCH /auth/me`, corregir préstamos, fecha por defecto, datos de ejemplo) para que la fase 2 sea solo front.

## Comandos y cambios en `CLAUDE.md`

- Nuevos: `pnpm -r test` (con `TEST_DATABASE_URL`), `pnpm -r lint --fix` (ordena imports), `db:seed`, `db:sample [--reset]`, `db:generate`/`db:migrate`. Todos en la sección "Comandos" del `CLAUDE.md` raíz.
- `.env.example`: `ADMIN_*`, `HOME_TZ`, `TEST_DATABASE_URL`.
- `CLAUDE.md` raíz apunta a `docs/dominio.md`, `docs/api-contrato.md` y `docs/backend.md`.

## Para la fase 2 (web)

- Contratos que usa la web: `docs/api-contrato.md` y tipos de `@jarvis/schemas`. Los listados omiten `q` vacío (si no, 400); la cookie exige `credentials: 'include'` o mismo origen.
- Parte de los datos de `db:sample` (`adulto@jarvis.local` / `invitado@jarvis.local`, contraseña `jarvis-dev`).
- Al crear `apps/web`, seguir los pasos de «Añadir una app o paquete al monorepo» del `CLAUDE.md` raíz.
- Deuda (`docs/deuda.md`): casi toda es de la fase 4 (imagen `prod`, reintento sin BD, límite de login). Solo afecta a la fase 2 la nota del OpenAPI con cuerpo opcional, si se genera algún cliente desde `/docs/json`.

## Conceptos aprendidos

Detalle y tarea de origen en [`docs/backend.md`](../backend.md#conceptos):

- **HTTP y diseño de API:** códigos 400/401/403/404/409/503, 404 frente a 403, `PATCH` frente a `PUT`, rutas de acción, recurso «yo», `204`, idempotencia, paginación, OpenAPI.
- **Fastify:** type provider, validator/serializer compiler, hooks, encapsulación, decoradores, parser de contenido, manejador de errores global.
- **Seguridad:** argon2 y salt, sesión opaca frente a JWT, cookies `HttpOnly`/`SameSite`/`Secure`, renovación deslizante, enumeración y ataques de tiempo, autorización por fila, cuerpos estrictos.
- **Modelo de datos:** migraciones (también a mano), enums, claves foráneas y `ON DELETE`, N:M, `CHECK`, índices parciales y sobre expresiones, `date`/`numeric`, extensiones.
- **Consultas:** unicidad como fuente de verdad, transacciones, `UPDATE` condicional, N+1, `EXISTS`, `LIKE` escapado, volatilidad de funciones, `TRUNCATE`, códigos de error de Postgres.
- **Validación, fechas, tests y operación:** query string como texto, zona de negocio y reloj inyectable, BD de test y aislamiento, *fail fast*, seed idempotente, scripts con barrera de entorno.

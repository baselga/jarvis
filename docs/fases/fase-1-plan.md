# Fase 1 — API hogar y gestión (biblioteca): plan

Alcance reducido: usuarios, roles y autenticación, más la **biblioteca** (libros, autores, géneros, sagas, préstamos y lecturas) con su gestión web. Compra, tareas y recetas quedan para fases futuras. Glosario: `docs/dominio.md`.

Tres bloques, cada uno usable y revisable por separado: **1a** auth y usuarios, **1b** biblioteca en la API, **1c** web `/gestion`.

## Decisiones

- **Sesiones opacas en BD, hechas a mano** (sin librería de auth): token aleatorio, en la tabla `sessions` solo su hash. La web lo recibe en cookie `httpOnly`; el asistente lo enviará como `Authorization: Bearer`. Revocar = borrar la fila. Más simple que JWT y revocable. Se explica en detalle al llegar a la tarea 5.
- **Contraseñas con argon2** (`@node-rs/argon2`): algoritmo recomendado hoy para contraseñas, lento a propósito.
- **Sesiones de 30 días con renovación deslizante**, cookie `SameSite=Lax` + `Secure` en producción: uso doméstico, no hace falta pedir login a menudo.
- **Sin registro.** El primer admin sale de un *seed* con `ADMIN_EMAIL`/`ADMIN_PASSWORD` de `.env`; el resto de usuarios los crea el admin. Los invitados comparten una cuenta con rol `invitado`.
- **Los usuarios se desactivan, no se borran:** conservan sus lecturas y sus sesiones se invalidan.
- **Permisos en la API** con dos piezas: un *hook* `authenticate` (¿quién eres? → 401) y `requireRole(...)` (¿puedes? → 403). Las lecturas añaden autorización por fila (solo el dueño las modifica).
- **OpenAPI desde Zod** con `fastify-type-provider-zod` + `@fastify/swagger`, Swagger UI en `/docs`. Los esquemas viven en `packages/schemas`: una sola fuente para validación, tipos y documentación.
- **Migraciones con `drizzle-kit`** (`generate` + `migrate`), versionadas en `apps/api/drizzle/`. Se aplican al arrancar el contenedor en desarrollo.
- **IDs `uuid`** generados por Postgres: no revelan cuántos registros hay y no chocan si algún día se importan datos.
- **Autor, Género y Saga son entidades.** Autor y Género con relación N:M con Libro (tablas intermedias); Saga 1:N, con `orden en la saga` decimal (permite "2.5") y no único.
- **Borrado:** un autor, género o saga con libros no se puede borrar (409). Borrar un libro borra sus préstamos y lecturas.
- **Listados con `?q=` (`ILIKE` en título y autor), filtros y `limit`/`offset`.** Suficiente para unos cientos de libros.
- **Tests contra Postgres real:** BD `jarvis_test` en el mismo contenedor, migraciones al empezar y tablas vaciadas entre tests. Los permisos y las relaciones se rompen en el SQL; un mock no lo vería.
- **Web:** Vite + React + TanStack Router + TanStack Query + **Mantine** + React Hook Form con los esquemas Zod compartidos. En desarrollo, Vite hace de *proxy* de `/api` hacia la API: mismo origen, así la cookie funciona sin CORS.

## Tareas

### 1a — Auth, usuarios y roles

1. [x] **Migraciones y tablas de usuarios:** `drizzle-kit`, scripts `db:generate`/`db:migrate`, tablas `users` (nombre, email, hash, rol, activo) y `sessions`; migrar al arrancar en dev.
2. [x] **Infra de tests con BD:** BD `jarvis_test` (la crea el *globalSetup* de Vitest), *setup* de Vitest que migra y helper para vaciar tablas y crear usuarios/sesiones de prueba. Documentar en la sección "Comandos" del `CLAUDE.md` raíz cómo se ejecutan los tests (host o contenedor, `TEST_DATABASE_URL`).
3. [ ] **OpenAPI:** type provider de Zod, `@fastify/swagger` + UI en `/docs`, `/health` migrado al nuevo patrón.
4. [ ] **Contraseñas y seed:** helper de hash/verificación con argon2 y script `db:seed` que crea el admin desde `.env` si no existe. Tests: hash y verificación.
5. [ ] **Login, logout y `/auth/me`:** crear sesión, cookie, expiración y renovación, cierre de sesión. Tests: credenciales malas → 401, usuario desactivado → 401, sesión caducada → 401, logout invalida el token, Bearer y cookie funcionan.
6. [ ] **Autorización:** `authenticate` y `requireRole`. Tests: sin token → 401, rol insuficiente → 403.
7. [ ] **Gestión de usuarios (admin):** listar, crear, editar (nombre, rol, activo), resetear contraseña; cambiar la propia contraseña (cualquiera salvo invitado). Tests: solo admin gestiona, adulto e invitado → 403, desactivar invalida sesiones.

### 1b — Biblioteca

8. [ ] **Modelo de la biblioteca:** tablas `books`, `authors`, `book_authors`, `genres`, `book_genres`, `sagas`, `loans`, `readings` + migración + esquemas Zod en `packages/schemas`.
9. [ ] **Autores:** CRUD completo (el patrón de referencia para el resto). Tests: permisos por rol (invitado lee, no crea/edita/borra), borrar autor con libros → 409.
10. [ ] **Géneros y sagas:** CRUD siguiendo el patrón; detalle de saga con sus libros en orden. Tests: permisos por rol, 409 al borrar con libros.
11. [ ] **Libros (CRUD):** alta y edición con autores, géneros y saga en una transacción; detalle con relaciones y estado de préstamo. Tests: permisos por rol, IDs de autor/género inexistentes → 400.
12. [ ] **Listado de libros:** `q`, `autor`, `genero`, `saga`, `prestado`, `limit`/`offset` y total. Tests: búsqueda y filtros.
13. [ ] **Préstamos:** prestar (409 si ya está prestado), devolver, historial por libro y préstamos activos. Tests: permisos por rol, doble préstamo → 409.
14. [ ] **Lecturas:** CRUD de lecturas propias (inicio opcional, fin, valoración 1–5 y nota opcionales), ver las de la casa por libro y por usuario. Tests: invitado → 403 (ni ve ni crea), no puedo editar/borrar lecturas de otro → 403, admin tampoco.

### 1c — Web `/gestion`

15. [ ] **Esqueleto de `apps/web`:** Vite + React + Mantine + TanStack Router/Query, *proxy* `/api`, servicio en Compose y los 4 pasos de "Añadir una app" de `CLAUDE.md` (incluido su `CLAUDE.md`).
16. [ ] **Login y sesión:** pantalla de login, `/auth/me` para saber quién soy, rutas protegidas, logout, cambiar contraseña.
17. [ ] **Libros:** tabla con búsqueda, filtros y paginación; formulario de alta/edición con *multiselect* de autores y géneros y saga + orden.
18. [ ] **Autores, géneros y sagas:** listados y formularios.
19. [ ] **Detalle de libro:** préstamos (prestar/devolver) y lecturas (las mías editables, las de la casa visibles).
20. [ ] **Usuarios (solo admin)** y adaptar la interfaz al rol (ocultar acciones que la API rechazaría).

## Tests

- Obligatorios (auth, roles, permisos): tareas 4–7, 9–11, 13 y 14, todos contra Postgres real con `inject()`.
- Tarea 12: búsqueda y filtros, porque es lógica SQL fácil de romper.
- Web: sin tests en esta fase; la seguridad vive en la API y la web se verifica a mano.

## Terminada cuando

- Puedo iniciar sesión en la web y gestionar libros, autores, géneros, sagas, préstamos, lecturas y usuarios.
- Un invitado entra, ve la biblioteca y no puede modificar nada; un adulto no gestiona usuarios ni toca lecturas ajenas.
- `/docs` muestra la API documentada.
- `docker compose up -d` levanta `postgres`, `api` y `web`; `pnpm -r typecheck`, `pnpm -r test` y `pnpm -r lint` pasan.

## Notas

- Deuda (tarea 1): el `CMD` de la imagen `prod` no aplica migraciones (se resolverá al desplegar). El email se pasa a minúsculas al escribirlo (tareas 4 y 7); la BD solo garantiza que sea único.
- Tests (tarea 2): helpers en `apps/api/src/test/helpers.ts` (`buildTestApp`, `createUser`, `createSession`). Provisionales: `createUser` guarda `passwordHash: 'not-a-hash'` (tarea 4: opción `password` con argon2) y `createSession` replica a mano el SHA-256 del token (tarea 5: usar la función real).

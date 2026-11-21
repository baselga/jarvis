# Fase 1 — API hogar (biblioteca): plan

Alcance reducido: usuarios, roles y autenticación, más la **biblioteca** (libros, autores, géneros, sagas, préstamos y lecturas) en la API. Compra, tareas y recetas quedan para fases futuras. Glosario: `docs/dominio.md`.

Tres bloques, cada uno revisable por separado: **1a** auth y usuarios, **1b** biblioteca en la API, **1c** cierre de la API (deuda y huecos que notarían la web y el asistente). La web `/gestion` pasa a la fase 2, que se planifica con su propia entrevista y numera sus tareas desde 1.

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

## Tareas

### 1a — Auth, usuarios y roles

1. [x] **Migraciones y tablas de usuarios:** `drizzle-kit`, scripts `db:generate`/`db:migrate`, tablas `users` (nombre, email, hash, rol, activo) y `sessions`; migrar al arrancar en dev.
2. [x] **Infra de tests con BD:** BD `jarvis_test` (la crea el *globalSetup* de Vitest), *setup* de Vitest que migra y helper para vaciar tablas y crear usuarios/sesiones de prueba. Documentar en la sección "Comandos" del `CLAUDE.md` raíz cómo se ejecutan los tests (host o contenedor, `TEST_DATABASE_URL`).
3. [x] **OpenAPI:** type provider de Zod, `@fastify/swagger` + UI en `/docs`, `/health` migrado al nuevo patrón.
4. [x] **Contraseñas y seed:** helper de hash/verificación con argon2 y script `db:seed` que crea el admin desde `.env` si no existe. Tests: hash y verificación.
5. [x] **Login, logout y `/auth/me`:** crear sesión, cookie, expiración y renovación, cierre de sesión. Tests: credenciales malas → 401, usuario desactivado → 401, sesión caducada → 401, logout invalida el token, Bearer y cookie funcionan.
6. [x] **Autorización:** `authenticate` y `requireRole`. Tests: sin token → 401, rol insuficiente → 403.
7. [x] **Gestión de usuarios (admin):** listar, crear, editar (nombre, email, rol, activo), resetear contraseña; cambiar la propia contraseña (cualquiera salvo invitado). Tests: solo admin gestiona, adulto e invitado → 403, desactivar invalida sesiones.

### 1b — Biblioteca

8. [x] **Modelo de la biblioteca:** tablas `books`, `authors`, `book_authors`, `genres`, `book_genres`, `sagas`, `loans`, `readings` + migración + esquemas Zod en `packages/schemas`.
9. [x] **Autores:** CRUD completo (el patrón de referencia para el resto). Tests: permisos por rol (invitado lee, no crea/edita/borra), borrar autor con libros → 409.
10. [x] **Géneros y sagas:** CRUD siguiendo el patrón; detalle de saga con sus libros en orden. Tests: permisos por rol, 409 al borrar con libros.
11. [x] **Libros (CRUD):** alta y edición con autores, géneros y saga en una transacción; detalle con relaciones y estado de préstamo. Tests: permisos por rol, IDs de autor/género inexistentes → 400.
12. [x] **Listado de libros:** `q`, `autor`, `genero`, `saga`, `prestado`, `limit`/`offset` y total. Tests: búsqueda y filtros.
13. [x] **Préstamos:** prestar (409 si ya está prestado), devolver, historial por libro y préstamos activos. Tests: permisos por rol, doble préstamo → 409.
14. [x] **Lecturas:** CRUD de lecturas propias (inicio opcional, fin, valoración 1–5 y nota opcionales), ver las de la casa por libro y por usuario. Tests: invitado ve las de la casa pero no crea, edita ni borra (403), no puedo editar/borrar lecturas de otro → 403, admin tampoco.

### 1c — Cierre de la API

Criterio: lo que es de la API y van a necesitar la web (fase 2) o el asistente (fase 3) se hace ahora, para que la fase 2 sea solo front. El límite de intentos de login y la imagen `prod` (migraciones y seed al arrancar) quedan para la fase 4, al desplegar.

15. [ ] **Ordenar imports:** regla de ESLint para todo el monorepo y autofix. Va primero para que el código nuevo ya la siga; no cambia comportamiento.
16. [ ] **503 si cae la BD:** `setErrorHandler` global que traduce los fallos de conexión a 503. Tests: BD inaccesible en una ruta protegida → 503.
17. [ ] **Emails en minúsculas en BD:** migración que normaliza los existentes y añade `check (email = lower(email))`. Tests: insertar un email con mayúsculas directamente en la BD falla.
18. [ ] **Búsqueda sin tildes:** extensión `unaccent` en los cuatro listados con `q`. Tests: «garcia» encuentra «García» en libros y autores, y al revés.
19. [ ] **`PATCH /auth/me`:** editar el propio nombre. El spec decide si también el email y si el invitado (cuenta compartida) puede (propuesta: no). Tests: permisos por rol, no se puede cambiar el rol ni el estado por esta vía.
20. [ ] **Corregir y borrar préstamos:** `PATCH`/`DELETE /loans/:id`. El spec fija qué roles pueden, si se puede «desdevolver» uno devuelto y cómo se evita que queden dos préstamos activos del mismo libro. Tests: permisos por rol, conflicto de préstamos activos → 409.
21. [ ] **Fecha por defecto con `HOME_TZ`:** si no llega fecha, préstamos y lecturas usan «hoy» en la zona horaria de casa (`Europe/Madrid` en `.env.example`). Tests: sin fecha se rellena con la de `HOME_TZ`, no con la del servidor.
22. [ ] **Datos de ejemplo:** script de desarrollo, separado de `db:seed`, que crea unas decenas de libros con autores (algunos con tildes), géneros y sagas, préstamos, lecturas y un usuario adulto y otro invitado. Se niega a ejecutarse en producción.

## Tests

- Obligatorios (auth, roles, permisos): tareas 4–7, 9–11, 13, 14, 19 y 20, todos contra Postgres real con `inject()`.
- Tareas 12 y 18: búsqueda y filtros, porque es lógica SQL fácil de romper.
- Tareas 16, 17 y 21: el comportamiento nuevo de cada una (503, restricción de la BD, fecha por defecto).
- Tareas 15 y 22: sin tests; basta con que `pnpm -r lint` pase y el script se ejecute sobre una BD vacía.

## Terminada cuando

- La API permite iniciar sesión y gestionar libros, autores, géneros, sagas, préstamos, lecturas y usuarios.
- Los tests prueban que un invitado ve la biblioteca y no puede modificar nada, y que un adulto no gestiona usuarios ni toca lecturas ajenas.
- `/docs` muestra la API documentada.
- La deuda de la API que no depende del despliegue está resuelta (bloque 1c) y hay datos de ejemplo para empezar la web.
- `docker compose up -d` levanta `postgres` y `api`; `pnpm -r typecheck`, `pnpm -r test` y `pnpm -r lint` pasan.

## Notas

- La deuda técnica y las mejoras pendientes se apuntan en `docs/deuda.md`, no aquí.
- Tests (tarea 2): helpers en `apps/api/src/test/helpers.ts` (`buildTestApp`, `createUser`, `createSession`).
- OpenAPI (tarea 3): patrón de rutas en `apps/api/src/modules/health/routes.ts`; errores con `ErrorResponseSchema` de `@jarvis/schemas`; `securitySchemes` pendiente para la tarea 5/6. ESLint desactiva `require-await` solo en `apps/api/src/modules/**/routes.ts` (glob actualizado en la tarea 9).
- Contraseñas (tarea 4): `hashPassword`/`verifyPassword` en `apps/api/src/auth/password.ts` (`verifyPassword` da `false` con hash malformado); `PasswordSchema` en `@jarvis/schemas` para la tarea 7; `createUser({ password })` para tests con login.
- Sesiones (tarea 5): la tarea 6 construye `authenticate` sobre `getRequestToken` + `validateSession` (`apps/api/src/auth/`) y añade `security` a las rutas en OpenAPI (los `securitySchemes` `bearerAuth`/`cookieAuth` ya existen). La tarea 7 usa `EmailSchema` en el alta.
- Autorización (tarea 6): patrón «Rutas protegidas» en `apps/api/CLAUDE.md` (`app.authenticate` como hook del plugin, `requireRole(...)` por ruta, `sessionSecurity` + `authErrorResponses` en el `schema`); referencia en `apps/api/src/auth/authenticate.test.ts`.
- Usuarios (tarea 7): `isUniqueViolation` (`db/errors.ts`) → 409 y `DbOrTx` (`db/client.ts`) para funciones que escriben dentro de una transacción; la tarea 11 los reutiliza en el alta de libros. `User` va sin `createdAt`/`updatedAt` hasta que la tarea 8 decida cómo serializar fechas. La web (fase 2) usa `PUT /auth/password` para la contraseña propia: `PUT /users/:id/password` sobre uno mismo cierra también la sesión actual.
- Biblioteca (tarea 8): tablas en `apps/api/src/db/schema/library.ts`, esquemas de entidad y de campo en `packages/schemas` (los DTOs los define cada CRUD). `ON DELETE RESTRICT` lanza `23001`, no `23503`: el helper de las tareas 9 y 11 debe detectar ambos. Las fechas van como `DateSchema` (`YYYY-MM-DD`); `createdAt`/`updatedAt` no se exponen.
- Autores (tarea 9): patrón de referencia en `apps/api/src/modules/authors/` (`routes.ts` + `service.ts` con resultado explícito; listado con `PaginationQuerySchema` y `{ authors, total }`); documentado en `apps/api/CLAUDE.md`. Reutilizables: `isForeignKeyViolation`, `containsPattern`, `http-errors.ts` y `createAuthor`/`createBook` en `test/helpers.ts` (la tarea 11 usa `isForeignKeyViolation` para ids inexistentes y `DbOrTx` en la transacción). Contrato: `q` vacío → 400 (la web debe omitirlo si la caja está vacía). La tarea 10 debe valorar si compensa extraer un CRUD genérico de entidades con solo `name`. Los tests no deben depender de la collation de la BD al ordenar nombres que solo difieren en mayúsculas.
- Géneros y sagas (tarea 10): `genres/` y `sagas/` copian `authors/` sin CRUD genérico (decidido: se extrae con una cuarta entidad «solo nombre»). `createGenre`/`createSaga` en `test/helpers.ts`; `createBook` acepta `genreIds`, `sagaId` y `sagaOrder` (la tarea 11 los usa). `SagaDetailSchema` lleva el `BookSchema` plano: cuando la tarea 11 añada autores/géneros al libro, decidir si el detalle de saga los incluye.
- Libros (tarea 11): `modules/books/` (`getBook` devuelve `BookDetail` con autores, géneros, saga y `activeLoan`; `createBook`/`updateBook` en transacción, patrón «N:M en transacción» en `apps/api/CLAUDE.md`). DTOs en `packages/schemas/src/book-detail.ts`; `createLoan` en `test/helpers.ts` para la tarea 13. `GET /sagas/:id` sigue con libros planos. `badRequest` y `constraintOf` disponibles para la tarea 13 (409 al prestar usa `conflict`).
- Listado de libros (tarea 12): `GET /books` devuelve `{ books: BookDetail[], total }` con `q`, `authorId`, `genreId`, `sagaId` y `loaned` (`true`/`false` exactos; si no, 400), combinados con AND; un id inexistente da lista vacía. La web (fase 2) usa esos nombres y omite `q` vacío. Relaciones de una lista con `withRelations` (`modules/books/service.ts`), reutilizable para los préstamos activos de la tarea 13. `bookColumns` exportado desde ahí.
- Préstamos (tarea 13): `modules/loans/` con `POST /books/:id/loans`, `POST /loans/:id/return`, `GET /books/:id/loans` y `GET /loans/active` (`ActiveLoan` incluye el `BookDetail`). DTOs en `packages/schemas/src/loan-detail.ts`. Las fechas son obligatorias: la web (fase 2) envía la fecha de hoy del usuario.
- Lecturas (tarea 14): `modules/readings/` con `GET /readings?bookId=&userId=` (cada elemento lleva `user: { id, name }` y `book: { id, title }`; «mis lecturas» = `?userId=<id de /auth/me>`), `POST /books/:id/readings` y `PATCH`/`DELETE /readings/:id` (solo el dueño, ni el admin). El invitado ve, pero no escribe. En `PATCH`, `null` vacía un campo y si no se envía no se toca. `createReading` en `test/helpers.ts` y `readingDateMessages` en `@jarvis/schemas`. La web (fase 2) usa estos contratos.

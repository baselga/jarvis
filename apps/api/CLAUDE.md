# apps/api — convenciones

API REST del hogar (Fastify + Drizzle + PostgreSQL). No sabe nada de IA.

## Estructura

```
src/server.ts      Arranque: lee config, crea la BD, escucha y cierra limpio (SIGTERM).
src/app.ts         buildApp(): crea la instancia Fastify y registra rutas. Sin puerto.
src/openapi.ts     registerOpenApi(): @fastify/swagger + Swagger UI en /docs (antes que las rutas). Su `transform` añade el 503 a todas las rutas.
src/error-handler.ts errorHandler: manejador global (`setErrorHandler` en `buildApp`). BD caída → 503; 4xx → el de Fastify; resto → 500 genérico.
src/config.ts      Variables de entorno validadas con Zod (fail fast).
src/dates.ts       todayIn(zona, now): el día de `now` en una zona IANA (`YYYY-MM-DD`). `DEFAULT_HOME_TZ`, `isValidTimeZone`.
src/db/client.ts   createDb(): pool `postgres` + Drizzle (con el esquema). Tipos `Db` y `DbOrTx`.
src/db/errors.ts   isUniqueViolation / isForeignKeyViolation / isCheckViolation: detectan los códigos de Postgres (`23505`; `23001` y `23503`; `23514`). `constraintOf(error)` da el nombre de la restricción que saltó. `isDbUnavailable`: fallo de conexión (red, cliente `postgres`, SQLSTATE `08xxx`/`57P0x`/`53300`).
src/db/search.ts   containsPattern(q): patrón `ILIKE` «contiene q» con `%`, `_` y `\` escapados. containsText(col, q): «col contiene q» sin mayúsculas ni tildes (`unaccent`, migración 0003).
src/db/schema/     Tablas Drizzle, un archivo por bloque (`users.ts`, `library.ts`); `index.ts` reexporta.
src/db/run-migrations.ts  runMigrations(url): la usan `migrate.ts` y el setup de tests.
src/db/migrate.ts  Aplica las migraciones pendientes (`pnpm db:migrate`; `dev` lo ejecuta al arrancar).
src/db/seed-admin.ts  seedAdmin(db, datos): crea el primer admin si no existe (idempotente).
src/db/seed.ts     Script `pnpm db:seed`: lee `ADMIN_*` del entorno y llama a seedAdmin.
src/db/sample.ts   Script `pnpm db:sample [--reset]` (solo desarrollo): inserta `sample-data.ts` en una transacción.
                   Sin `--reset` se niega si ya hay datos; con él vacía la biblioteca y los usuarios de ejemplo (no el admin).
src/db/sample-data.ts  Datos de ejemplo (libros, autores, préstamos, lecturas, usuarios): solo datos, fechas como «hace N días».
src/auth/          password.ts (argon2id), session.ts (crear/validar/borrar sesiones opacas),
                   request-token.ts (token de Bearer o cookie, opciones de la cookie),
                   authenticate.ts (plugin `auth`: `app.authenticate`, `requireRole`).
drizzle/           Migraciones SQL generadas por drizzle-kit, versionadas en git.
src/modules/<x>/   Una carpeta por entidad o grupo de rutas: `routes.ts` (plugin Fastify) y `routes.test.ts`
                   (`health`, `auth`, `users`, `authors`, `genres`, `sagas`, `books`, `loans`, `readings`). Con lógica de datos propia lleva también `service.ts`
                   (`authors` es el patrón de referencia).
src/http-errors.ts notFound(msg), badRequest(msg), forbidden(msg), conflict(msg) y serviceUnavailable(msg): errores HTTP compartidos por los módulos.
src/test/          Infra de tests: BD `_test` (env.ts, global-setup.ts, setup.ts) y helpers.
```

## Patrones

- **Dependencias inyectadas en `buildApp()`** (hoy la BD y la zona de casa): los tests pasan una simulada. Lo nuevo que dependa de algo externo entra por `BuildAppOptions`, no con imports globales.
- **Rutas como plugin:** `export const xxxRoutes: FastifyPluginAsyncZod = async (app) => { ... }` en `modules/<x>/routes.ts` y `app.register(...)` en `app.ts`. TypeScript infiere `body`/`params`/`query` y lo que se puede devolver a partir del `schema`: no anotes tipos a mano. (`require-await` está desactivada en `modules/**/routes.ts`, ver `eslint.config.js`).
- **Cada ruta con `schema`:** `tags`, `summary`, `body`/`params`/`querystring` y `response` con **todos** los códigos que devuelve; los errores con `ErrorResponseSchema` de `@jarvis/schemas`. Ver `src/modules/health/routes.ts`.
- **Rutas protegidas:** en el plugin de rutas, `app.addHook('onRequest', app.authenticate)` protege todo lo que registre (401 si no hay sesión válida; deja `request.user` y renueva la cookie). Por ruta, `preHandler: requireRole('admin', 'adult')` con la lista explícita de roles (403), sin jerarquía. En el `schema`: `security: sessionSecurity` y `response: { 200: X, ...authErrorResponses }` (solo `401` si no hay `requireRole`), ambos de `auth/authenticate.ts`. Si el plugin mezcla rutas públicas, `onRequest: app.authenticate` por ruta (como `/auth/me`).
- **Se valida también la respuesta:** las claves que no estén en el esquema se eliminan en silencio (no se filtran, p. ej. `passwordHash`); si falta un campo o no encaja su tipo, 500. Si un `return` convive con `reply.send(...)`, usa `as const` en el literal para que TS no ensanche los enums.
- **Cuerpos estrictos:** por defecto Zod quita en silencio las claves desconocidas. Si ignorar una haría creer al cliente que se aplicó (p. ej. `role` al editarse a sí mismo), `z.strictObject` → 400. Ver `UpdateMeRequestSchema` (`packages/schemas/src/auth.ts`).
- **Documentación:** Swagger UI en `/docs`, documento OpenAPI en `/docs/json`, generados desde los esquemas Zod.
- **Acceso a la BD con `app.db`** (decorador de Fastify), nunca creando otro cliente.
- **Tipos de petición/respuesta desde `@jarvis/schemas`**, no definidos aquí.
- **Variables de entorno nuevas:** añadirlas a `EnvSchema` en `config.ts`, a `.env.example` y, si Compose las pasa, a `docker-compose.yml`.
- **Cambiar el modelo:** editar `src/db/schema/` → `pnpm --filter @jarvis/api db:generate` → revisar el SQL de `drizzle/` → se aplica al reiniciar `api` (`docker compose restart api`). Las migraciones ya commiteadas no se editan. El SQL que el esquema no describe (extensiones, datos) va en una migración vacía con `db:generate --custom --name=<x>`, escrita a mano (ver `drizzle/0003_unaccent.sql`). El *watch* de `tsx` en Docker para Mac a veces no ve cambios de código: mismo remedio.
- **Reglas en la BD además de en Zod:** `check`, índice único parcial (`.where(...)`) e índice único sobre `lower(name)` en `db/schema/library.ts`. Un `ON DELETE RESTRICT` lanza `23001`, no `23503` (ese es de `NO ACTION` o un id inexistente): el helper de la tarea 9 debe mirar ambos. Los días sin hora son `date` (texto `YYYY-MM-DD`) + `DateSchema`, nunca `timestamp`.
- **Enums de Postgres desde Zod:** `pgEnum('x', XSchema.enum)` (no `.options`: en Zod 4 no es tupla). Ver `src/db/schema/users.ts`.
- **Cookie de sesión:** `jarvis_session` con las opciones de `sessionCookieOptions(secure)` (`auth/request-token.ts`), tanto en `setCookie` como en `clearCookie`. `Secure` llega por `BuildAppOptions.cookieSecure` → opción de los plugins `authPlugin` y `authRoutes`.
- **Token de la petición:** `getRequestToken(request)`; si hay cabecera `Authorization`, manda ella y la cookie se ignora.
- **Cuerpo vacío:** `buildApp` sustituye el parser de JSON: un cuerpo vacío con `Content-Type: application/json` llega como `undefined` (no 400). Así funcionan los POST sin cuerpo, como logout. Si la ruta tiene `body` en el `schema` y el cuerpo es opcional, el esquema termina en `.nullish()`, no `.optional()`: Fastify valida un cuerpo ausente como `null` (con o sin `Content-Type`). Ver `ReturnLoanRequestSchema`.
- **Emails:** toda entrada de email usa `EmailSchema` de `@jarvis/schemas` (trim + minúsculas). El login busca el email tal cual; por eso la BD también exige minúsculas (`check users_email_lowercase`): un alta que se salte Zod falla con `23514` en vez de crear un usuario que no puede entrar.
- **Conflictos de unicidad:** no se consulta antes si existe; se inserta/actualiza y, si `isUniqueViolation(error)` (`db/errors.ts`), se responde 409. La restricción `unique` de Postgres es la fuente de verdad y no hay carreras entre dos peticiones a la vez. Ver `modules/users/routes.ts`.
- **Transacciones:** cuando varias escrituras deben aplicarse juntas o ninguna, `app.db.transaction(async (tx) => …)` y todas con `tx`; si algo lanza dentro, `ROLLBACK`. Las funciones que escriben y pueden ir dentro de una reciben `DbOrTx` (p. ej. `deleteUserSessions`).
- **Ids de la URL:** `z.uuid()` acepta mayúsculas y Postgres compara uuid sin distinguirlas. Para comparar ids en JS (p. ej. «¿soy yo?»), usa el id leído de la BD, no el de `params`. Ver la autoprotección en `modules/users/routes.ts`.
- **Módulos (ruta → servicio → resultado explícito):** la ruta valida (Zod), comprueba permisos y traduce a HTTP; `service.ts` son funciones sueltas `fn(db: DbOrTx, ...)` con el SQL, sin conocer HTTP. El servicio devuelve una unión discriminada (`{ status: 'ok', ... } | { status: 'not_found' } | { status: 'name_taken' }`…) y traduce ahí los códigos de Postgres (`isUniqueViolation`, `isForeignKeyViolation`); la ruta hace un `switch` exhaustivo sobre `status` y responde 404/409. Ver `modules/authors/`. Los `notFound`/`conflict` de `http-errors.ts` se definen como constantes del módulo. `users`, `auth` y `health` no tienen `service.ts` (su SQL está en la ruta); no se migran salvo que crezcan.
- **Padre con hijos (detalle):** dos consultas (el padre y luego sus hijos), no un `JOIN` que repita el padre por fila. `NULLS LAST` se escribe con `` sql`${col} asc nulls last` `` (Drizzle no tiene helper). Ver `getSaga` en `modules/sagas/service.ts`. `genres` y `sagas` son copia de `authors` (no hay CRUD genérico: se extraería con una cuarta entidad «solo nombre»).
- **Relaciones N:M en transacción** (`createBook`/`updateBook` en `modules/books/service.ts`): el padre y sus filas de la tabla intermedia se escriben con `db.transaction` y, al editar, **se reemplaza el conjunto** (borrar las filas del padre e insertar las nuevas; `undefined` = no tocar, `[]` = vaciar). Los ids se deduplican (`new Set`, en minúsculas) para no chocar con la PK compuesta. Un id inexistente lanza una clave foránea que deshace todo; se traduce fuera de la transacción identificando la restricción con `constraintOf`. Una regla `check` que Zod no ve (necesita el estado actual) se captura con `isCheckViolation` → 400. El detalle se lee tras el `COMMIT`.
- **Listados con búsqueda y paginación:** query con `PaginationQuerySchema` (`limit` 1–200, def. 50; `offset`; `z.coerce` porque la query llega como texto) más `q`; respuesta `{ <entidad>s, total }` con `total` sobre el mismo `where` sin `limit`/`offset`. Ordena siempre por el campo y luego por `id` (desempate estable). `q` con `containsText(col, q)` (`db/search.ts`): sin distinguir mayúsculas ni tildes, vía la extensión `unaccent`. Los filtros sobre tablas relacionadas (autor, género, préstamo, `q` en autores) van con `exists(...)`/`notExists(...)` y una subconsulta correlacionada, no con `JOIN`: un `JOIN` repetiría el libro e inflaría `total`. Un id de filtro inexistente da lista vacía, no error. Booleanos de query con `z.stringbool(...)`, nunca `z.coerce.boolean()` (`"false"` → `true`). Ver `listBooks` en `modules/books/service.ts`.
- **Relaciones en lote (evitar N+1):** para devolver una lista con sus relaciones, se lee la página y después cada relación de una vez para todos los ids (`inArray`), repartida con un `Map`; nunca una consulta por elemento. Ver `withRelations` en `modules/books/service.ts` (también lo usan `getBook` y `listActiveLoans`). `bookColumns` se exporta desde ahí y lo reutilizan `modules/sagas/service.ts` y `modules/loans/service.ts`.
- **Acciones con reglas (`POST /loans/:id/return`):** ruta de acción en vez de un `PATCH` genérico, y `UPDATE … WHERE id = $1 AND <estado> RETURNING` (p. ej. `returned_at IS NULL`): atómico, sin leer antes. Si no cambia ninguna fila, una segunda consulta distingue 404 de 409. Ver `returnLoan` en `modules/loans/service.ts`. Puede convivir con un `PATCH` de corrección sin reglas de flujo (`PATCH /loans/:id`) si las invariantes viven en la BD: `23505` → 409 y `23514` → 400. Ver `updateLoan`.
- **Autorización por fila (`PATCH`/`DELETE /readings/:id`):** además del rol, «¿esta fila es tuya?» va en el propio `WHERE` (`UPDATE/DELETE … WHERE id = $1 AND user_id = <yo> RETURNING`): una fila ajena nunca se toca. Si no cambia ninguna, una segunda consulta distingue 404 (no existe) de 403 (es de otro). El id del usuario sale de `request.user`, nunca del cuerpo. Ver `modules/readings/service.ts`.
- **Fecha de hoy:** nunca `CURRENT_DATE` ni `new Date().toISOString().slice(0, 10)` (van en la zona del servidor o en UTC). En rutas, `app.today()` (decorador, hoy en `HOME_TZ`, que llega por `BuildAppOptions.homeTimeZone`); fuera, `todayIn(zona, now)` de `src/dates.ts`. El valor por defecto se pone en la ruta y el servicio recibe la fecha ya resuelta; solo en los `POST` (en un `PATCH`, ausente = no tocar). Los tests fijan el reloj con `vi.setSystemTime(...)` antes de `createSession` y lo restauran con `vi.useRealTimers()`. Ver `modules/loans/routes.ts`.
- **Códigos HTTP con intención:** 503 si falla una dependencia (BD), no 500. El 503 por BD caída y el 500 genérico («Error interno», sin el SQL de Drizzle; el detalle va al log) los pone el manejador global: las rutas no capturan errores de conexión ni declaran el 503 (lo documenta `openapi.ts`). Solo `/health` tiene el suyo.

## Tests

- Vitest, archivo junto al código (`foo.ts` → `foo.test.ts`).
- Peticiones con `app.inject()` sobre `buildTestApp()` (de `src/test/helpers.ts`; acepta las opciones de `buildApp` salvo `db`, p. ej. `{ cookieSecure: true }`); sin abrir puertos.
- BD real (`TEST_DATABASE_URL`, nombre acabado en `_test`) con los helpers `createUser` y `createSession`. Las reglas de la BD (`check`, `RESTRICT`…) se prueban con `expectPgCode(promise, código)`, ver `db/schema/*.test.ts`. `createUser({ password })` solo si el test hace login (argon2 es lento). La BD simulada solo para simular fallos, como en `health.test.ts`.
- Cada test empieza con las tablas vacías (`beforeEach` en `src/test/setup.ts`): crea lo que necesites en el propio test.
- Sin paralelismo entre archivos (comparten BD).
- Ejecutar: `pnpm --filter @jarvis/api test` (Postgres levantado).

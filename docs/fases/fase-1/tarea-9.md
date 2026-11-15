# Tarea 9 — Autores

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

CRUD completo de autores (`/authors`) con permisos por rol, listado con búsqueda y paginación, y 409 al repetir nombre o al borrar un autor con libros. Es además el **patrón de referencia** del resto de entidades de la biblioteca: inaugura la estructura de módulos (`src/modules/<entidad>/`) y deja piezas reutilizables (paginación, errores HTTP, detección de claves foráneas, helpers de test).

## Decisiones

- **Carpeta por entidad: `src/modules/authors/` con `routes.ts` (HTTP) y `service.ts` (acceso a datos)** — la ruta valida, comprueba permisos y traduce a códigos HTTP; el servicio hace el SQL y no sabe nada de HTTP. Cada capa se lee y se prueba por separado, y `books` (tarea 11) tendrá mucha lógica que no queremos dentro de un handler.
- **El servicio recibe la BD como primer parámetro (`DbOrTx`) y son funciones sueltas, no clases** — mismo patrón que `deleteUserSessions`: se pueden llamar dentro de una transacción (tarea 11) y se prueban con la BD de test.
- **El servicio devuelve un resultado explícito, no lanza ni conoce HTTP:** `{ status: 'ok', author } | { status: 'not_found' } | { status: 'name_taken' } | { status: 'has_books' }`. El servicio traduce los códigos de Postgres (`isUniqueViolation`, `isForeignKeyViolation`) a estos estados; la ruta los traduce a 404/409. Así el `switch` de la ruta es exhaustivo y TypeScript avisa si falta un caso.
- **Lo existente se migra a `modules/` en su propia subtarea (9.2), antes de crear `authors`:** `routes/users.ts`, `auth.ts`, `health.ts` y sus tests pasan a `modules/users|auth|health/` — así no conviven dos convenciones y el glob de ESLint se cambia una sola vez. Es un movimiento puro (`git mv` + imports): **no se extrae `service.ts`** de users/auth/health, porque reescribir código ya probado mezclaría un refactor con un movimiento y haría la revisión confusa; su SQL se queda en la ruta.
- **`src/auth/` (hash, sesiones, plugin `authenticate`) no se mueve:** es infraestructura transversal que usan todos los módulos, no un módulo más. `modules/auth/` solo lleva las rutas `/auth/*`.
- **Edición con `PATCH` y `name` obligatorio** — consistente con usuarios; cuando libros tenga campos opcionales, el mismo molde sirve.
- **Listado con `q`, `limit` (por defecto 50, máx. 200) y `offset`, respuesta `{ authors, total }` ordenada por nombre** — sigue la decisión de la fase. Orden por `name` y luego `id` para que la paginación sea estable con nombres iguales salvo mayúsculas.
- **`q` hace `ILIKE '%q%'` escapando `%`, `_` y `\`** — si no, buscar `100%` o `a_b` actuaría como comodín. El helper `containsPattern` es reutilizable.
- **`PaginationQuerySchema` en `@jarvis/schemas`** — `limit`/`offset` con `z.coerce` (los query params llegan como texto) y reutilizable en géneros, sagas, libros y préstamos.
- **Leer: `admin`, `adult` y `guest`; escribir: `admin` y `adult`** — según `docs/dominio.md`.
- **Códigos:** nombre repetido (sin distinguir mayúsculas) → 409; borrar con libros → 409; id inexistente → 404; id mal formado o nombre vacío → 400. Renombrar a un nombre que solo difiere en mayúsculas del propio es válido; reenviar el mismo nombre también (200).
- **Errores HTTP compartidos** (`notFound`, `conflict`) salen de `routes/users.ts` a `src/http-errors.ts` y `users.ts` los importa — se van a usar en cinco módulos más y copiarlos seis veces sería deuda inmediata.
- **Sin `bookCount` ni «libros del autor»** — es el filtro `?autor=` del listado de libros (tarea 12).
- **Detección de FK: `isForeignKeyViolation`** (`db/errors.ts`) acepta `23001` (`restrict_violation`, `ON DELETE RESTRICT`) y `23503` (`foreign_key_violation`, id inexistente), como avisa la nota de la tarea 8. En esta tarea el borrado de autor lo usa; la tarea 11 lo reutiliza para ids inexistentes.

## Especificación

Todas las rutas con `onRequest: app.authenticate` en el plugin y `security: sessionSecurity`; las de escritura con `preHandler: requireRole('admin', 'adult')`; tag OpenAPI `authors`.

### Endpoints

| Método y ruta        | Roles                  | Cuerpo / query                                  | Respuestas                                     |
| -------------------- | ---------------------- | ----------------------------------------------- | ---------------------------------------------- |
| `GET /authors`       | admin, adult, guest    | query: `q?`, `limit?` (1–200, def. 50), `offset?` (≥0, def. 0) | 200 `{ authors: Author[], total }`; 400; 401   |
| `GET /authors/:id`   | admin, adult, guest    | —                                               | 200 `Author`; 400; 401; 404                    |
| `POST /authors`      | admin, adult           | `{ name }` (`AuthorNameSchema`)                 | 201 `Author`; 400; 401; 403; 409 nombre repetido |
| `PATCH /authors/:id` | admin, adult           | `{ name }`                                      | 200 `Author`; 400; 401; 403; 404; 409 nombre repetido |
| `DELETE /authors/:id`| admin, adult           | —                                               | 204; 400; 401; 403; 404; 409 tiene libros      |

- `total` es el número de autores que cumplen `q` (sin `limit`/`offset`).
- Mensajes en español: `Autor no encontrado`, `Ya existe un autor con ese nombre`, `No se puede borrar: el autor tiene libros`.
- `GET /authors` sin `q` ordena por `name, id`; con `q`, igual.

### Servicio (`modules/authors/service.ts`)

- `listAuthors(db, { q, limit, offset })` → `{ authors, total }` (dos consultas en paralelo con el mismo `where`).
- `getAuthor(db, id)` → `Author | undefined`.
- `createAuthor(db, { name })` → `ok | name_taken`.
- `updateAuthor(db, id, { name })` → `ok | not_found | name_taken`.
- `deleteAuthor(db, id)` → `ok | not_found | has_books`.

Sin comprobar antes si existe o tiene libros: se escribe y se captura la violación de la BD (la restricción es la fuente de verdad y no hay carreras), como en `routes/users.ts`.

### Esquemas Zod (`packages/schemas/src/`)

- `pagination.ts` — `PaginationQuerySchema`: `{ limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) }`.
- `author.ts` — añadir `CreateAuthorRequestSchema` (`{ name: AuthorNameSchema }`), `UpdateAuthorRequestSchema` (igual), `AuthorIdParamsSchema` (`{ id: z.uuid() }`), `AuthorListQuerySchema` (`PaginationQuerySchema` + `q: z.string().trim().min(1).max(200).optional()`), `AuthorListResponseSchema` (`{ authors: Author[], total: int }`) y sus tipos inferidos.

### Otros

- `db/errors.ts`: `isForeignKeyViolation(error)` mirando `23001` y `23503`, también en `cause` (mismo envoltorio de Drizzle que `isUniqueViolation`).
- `db/search.ts`: `containsPattern(q)` → `%${q con \, % y _ escapados}%`.
- `test/helpers.ts`: `createAuthor({ name? })` y `createBook({ title?, authorIds? })`; insertan con `testDb` (todavía no hay rutas de libros).
- `app.ts`: `app.register(authorRoutes)`.
- `eslint.config.js` (9.2): el glob de `require-await` pasa de `apps/api/src/routes/**/*.ts` a `apps/api/src/modules/**/routes.ts`.
- `apps/api/CLAUDE.md` (9.2 y 9.3): actualizar «Estructura» (`modules/`, `http-errors.ts`, `db/search.ts`), las referencias a `routes/health.ts` y `routes/users.ts`, añadir el patrón «Módulos» (ruta → servicio → resultado explícito), `PaginationQuerySchema`, y eliminar «Pendiente de decidir» (estructura de módulos ya decidida).
- `docs/fases/fase-1-plan.md` (9.2): las notas de las tareas 3 y 7 citan `routes/health.ts` y el glob de ESLint; actualizar las rutas.

### Migración (9.2)

| Antes                         | Después                              |
| ----------------------------- | ------------------------------------ |
| `routes/health.ts` y `.test`  | `modules/health/routes.ts` y `routes.test.ts` |
| `routes/auth.ts` y `.test`    | `modules/auth/routes.ts` y `routes.test.ts`   |
| `routes/users.ts` y `.test`   | `modules/users/routes.ts` y `routes.test.ts`  |

Solo cambian las rutas de los imports (`../` → `../../`) y los imports de `app.ts`; ninguna línea de lógica ni de test. El export de cada plugin conserva su nombre (`healthRoutes`, `authRoutes`, `userRoutes`). Se borra la carpeta `routes/`.

## Archivos

- `apps/api/src/db/errors.ts` — modificar: `isForeignKeyViolation`.
- `apps/api/src/db/errors.test.ts` — crear: tests de ambos helpers con errores simulados.
- `apps/api/src/db/search.ts` — crear: `containsPattern`.
- `apps/api/src/http-errors.ts` — crear: `notFound(message)`, `conflict(message)`.
- `apps/api/src/routes/users.ts` — modificar (9.1): importar de `http-errors.ts`.
- `apps/api/src/test/helpers.ts` — modificar: `createAuthor`, `createBook`.
- `packages/schemas/src/pagination.ts` — crear.
- `packages/schemas/src/author.ts` — modificar: DTOs.
- `packages/schemas/src/index.ts` — modificar: reexportar `pagination.js`.
- `apps/api/src/modules/authors/service.ts` — crear.
- `apps/api/src/modules/authors/routes.ts` — crear.
- `apps/api/src/modules/authors/routes.test.ts` — crear.
- `apps/api/src/routes/{health,auth,users}.ts` y sus `.test.ts` — mover (9.2) a `apps/api/src/modules/{health,auth,users}/routes.ts` y `routes.test.ts`, con los imports corregidos.
- `apps/api/src/app.ts` — modificar: imports de la migración (9.2) y registrar `authorRoutes` (9.3).
- `eslint.config.js` — modificar (9.2): glob de `require-await`.
- `apps/api/CLAUDE.md` — modificar (9.2 y 9.3): estructura y patrón de módulos.
- `docs/fases/fase-1-plan.md` — modificar (9.2): rutas citadas en las notas.

## Subtareas

- [x] **9.1 — Piezas reutilizables:** `isForeignKeyViolation`, `containsPattern`, `http-errors.ts` (y `users.ts` lo usa), `PaginationQuerySchema`, helpers `createAuthor`/`createBook`. Deja el proyecto compilando y los tests existentes en verde. Tests: `isForeignKeyViolation` con `23001`, `23503` (directo y en `cause`) y otro código → `false`; `containsPattern` escapa `%`, `_` y `\`.
- [x] **9.2 — Migrar `routes/` a `modules/`:** mover health, auth y users con sus tests (ver tabla «Migración»), actualizar imports, `app.ts`, glob de ESLint y las referencias en `apps/api/CLAUDE.md` y en las notas del plan; borrar `routes/`. Es un movimiento puro: no se modifica ninguna línea de lógica ni de test. Tests: ninguno nuevo; los 113+ existentes pasan sin cambios (typecheck, lint y tests en verde; `/docs` sigue sirviendo el mismo OpenAPI).
- [x] **9.3 — Módulo `authors`:** DTOs, `service.ts`, `routes.ts`, registro en `app.ts`, documentación del patrón. Tests: los de la sección «Tests» de rutas.

## Tests

En `modules/authors/routes.test.ts`, con `inject()` y Postgres real. Marcados **(obligatorio)** los de permisos.

**Permisos (obligatorio, 9.3)**
- [x] sin token, las cinco rutas → 401
- [x] invitado hace GET `/authors` y GET `/authors/:id` → 200
- [x] invitado hace POST, PATCH y DELETE → 403 y el autor no cambia ni se borra
- [x] adulto y admin crean, editan y borran → 201 / 200 / 204

**CRUD**
- [x] POST crea el autor, recorta espacios del nombre y devuelve 201 con `id` y `name`
- [x] POST con nombre vacío o solo espacios → 400
- [x] POST con un nombre que solo difiere en mayúsculas de uno existente → 409
- [x] GET `/authors/:id` inexistente → 404; con id mal formado → 400
- [x] PATCH cambia el nombre; a un nombre ya usado por otro → 409; al mismo nombre o cambiando solo mayúsculas del propio → 200; inexistente → 404
- [x] DELETE de un autor sin libros → 204 y GET posterior → 404; inexistente → 404
- [x] DELETE de un autor con libros → 409, el autor sigue existiendo y el libro sigue vinculado

**Listado**
- [x] ordenado por nombre, con `total`
- [x] `q` filtra sin distinguir mayúsculas y `total` cuenta solo los coincidentes
- [x] `q=%` o `q=_` solo coincide con nombres que contienen ese carácter literal
- [x] `limit` y `offset` paginan sin repetir ni saltar (con `total` constante)
- [x] `limit=201`, `limit=0` u `offset=-1` → 400

**Migración (9.2):** sin tests nuevos; sirve de prueba que los de users, auth y health pasan idénticos desde su nueva ubicación.

**Unitarios (9.1, `db/errors.test.ts` y `db/search.test.ts`)**
- [x] `isForeignKeyViolation`: `23001`, `23503`, en `cause`, otro código → `false`
- [x] `containsPattern('100%_a\\b')` escapa los tres caracteres especiales

## Conceptos nuevos

- **Organización por módulos (feature folders):** agrupar por entidad (todo lo de autores junto) en vez de por tipo técnico (todas las rutas juntas); escala mejor cuando cada entidad tiene ruta, servicio y tests.
- **Capa de servicio:** separar «qué hace el negocio con la BD» (`service.ts`) de «cómo se expone por HTTP» (`routes.ts`). La ruta no escribe SQL; el servicio no conoce códigos HTTP.
- **Resultado explícito en lugar de excepciones:** una unión discriminada (`{ status: 'not_found' }`…) obliga a la ruta a tratar cada caso y TypeScript comprueba que no falta ninguno.
- **Traducir errores de BD en un solo sitio:** los códigos de Postgres (`23505`, `23001`, `23503`) no salen del servicio.
- **Escapar comodines en `LIKE`/`ILIKE`:** `%` y `_` significan «cualquier cosa» en el patrón; el texto del usuario debe escaparse (aquí no hay inyección SQL porque va parametrizado, pero sí resultados engañosos).
- **Paginación `limit`/`offset` con `total`:** simple y suficiente a esta escala; la ordenación debe ser estable (desempate por `id`) o las páginas se solapan.
- **`z.coerce` en query params:** la query llega como texto; el esquema lo convierte a número antes de validarlo.

## Fuera de alcance

- Géneros y sagas con el mismo molde — tarea 10 (valorar entonces si compensa extraer un CRUD genérico de entidades con solo `name`).
- Libros del autor y `?autor=` — tareas 11 y 12.
- Extraer `service.ts` de users y auth — no se hace; su lógica queda en la ruta (se valorará si crece, p. ej. con `PATCH /auth/me`).
- `createdAt`/`updatedAt` en la respuesta — no previsto en esta fase.
- Índices para la búsqueda `ILIKE` — solo si hiciera falta (tarea 12).

## Registro de implementación

**9.1 — Piezas reutilizables**
- Creados: `db/errors.test.ts`, `db/search.ts`, `db/search.test.ts`, `http-errors.ts`, `packages/schemas/src/pagination.ts`. Modificados: `db/errors.ts`, `routes/users.ts`, `test/helpers.ts` (`createAuthor`, `createBook`), `packages/schemas/src/index.ts`.
- `db/errors.ts`: `isUniqueViolation` e `isForeignKeyViolation` comparten un `hasCode(error, codes)` que mira el error y su `cause`. Añadí también tests de `isUniqueViolation` (no estaba en la especificación; ya no tenía ninguno).
- `users.ts`: el `notFound` fijo pasa a `userNotFound = notFound('Usuario no encontrado')` para conservar el mensaje; `conflict` se importa tal cual.
- `createAuthor`/`createBook` no tienen test propio: los ejercitará 9.3. Revisar que `createBook` inserta en `book_authors` solo si hay `authorIds`.
- Verificado: format, typecheck y lint sin errores; 120 tests en verde.

**9.2 — Migrar `routes/` a `modules/`**
- Movidos con `git mv` (health, auth y users, cada uno a `modules/<x>/routes.ts` y `routes.test.ts`); `routes/` borrada. Modificados: imports de los seis archivos (`../` → `../../`, único cambio en ellos), `app.ts`, `eslint.config.js` (glob `apps/api/src/modules/**/routes.ts`), `apps/api/CLAUDE.md` (estructura y referencias a rutas), `docs/fases/fase-1-plan.md` (nota de la tarea 3).
- Sin desviaciones. En `apps/api/CLAUDE.md` dejé «Pendiente de decidir» y la mención de `PaginationQuerySchema` para 9.3, como dice la especificación.
- Quedan menciones a `routes/*.ts` solo en archivos históricos (`fase-0.md`, `tarea-3.md`, `tarea-6.md`, y un ejemplo en la skill `jarvis-finish`); no los toqué.
- Verificado: format, typecheck y lint sin errores; 120 tests en verde (los mismos que antes, `openapi.test.ts` incluido).

**9.3 — Módulo `authors`**
- Creados: `modules/authors/service.ts`, `routes.ts`, `routes.test.ts` (25 tests). Modificados: `packages/schemas/src/author.ts` (DTOs), `app.ts` (registro), `apps/api/CLAUDE.md` (estructura, `db/errors`/`db/search`, patrones «Módulos» y «Listados», eliminado «Pendiente de decidir»).
- Tests de permisos escritos primero y comprobados en rojo (404 por no existir las rutas); el resto al final.
- `UpdateAuthorRequestSchema` es el mismo objeto que `CreateAuthorRequestSchema` (alias), no un `z.object` duplicado.
- Los tests de `q` evitan nombres que solo difieren en mayúsculas al comprobar el orden: ese orden depende de la collation de la BD (probé `Isaac`/`ISAAC` y salió en orden distinto al esperado); lo que garantiza el servicio es `name, id`, no una collation concreta.
- Para revisar con atención: el `switch` sin `default` en las rutas (el tipo de retorno es exhaustivo) y que `deleteAuthor` traduce a `has_books` cualquier `23001`/`23503` (hoy solo puede venir de `book_authors`).
- Verificado: format, typecheck y lint sin errores; 145 tests en verde.

**Mejoras de la revisión (R1 y R2)**
- Modificado solo `modules/authors/routes.test.ts`: R1 → test `it.each(['PATCH', 'DELETE'])` con `/authors/no-es-un-uuid` → 400; R2 → `'?q='` y `'?q=%20'` añadidos al `it.each` de 400 del listado (queda fijado el contrato: `q` vacío es 400, no «sin filtro»).
- Sin desviaciones ni cambios de código de producción. Verificado: format, typecheck y lint sin errores; 149 tests en verde.

## Revisión

Resultado: lista para terminar (segunda vuelta: R1 y R2 aplicadas y comprobadas; format, typecheck, lint y 149 tests en verde).

- [x] (aceptada) **R1 · recomendable · `modules/authors/routes.test.ts` (bloque `CRUD`)** — la especificación da 400 por id mal formado en `GET`, `PATCH` y `DELETE`, pero solo se prueba en `GET` → añadir un test que haga `PATCH` y `DELETE` a `/authors/no-es-un-uuid` y espere 400. Los tres comparten `AuthorIdParamsSchema`, pero si alguien lo quitara de una ruta (ver el 500 de Postgres por uuid inválido) ningún test fallaría.
- [x] (aceptada) **R2 · opcional · `modules/authors/routes.test.ts` (bloque `listado`)** — `q` vacío o solo espacios (`?q=`, `?q=%20`) da 400 por `min(1)` y no está probado → añadir `'?q='` y `'?q=%20'` al `it.each` de 400, o decidir que `q` vacío equivale a «sin filtro». Es una decisión de contrato que el futuro front (caja de búsqueda vacía) va a tocar; mejor dejarla fijada con un test.

Segunda vuelta: sin propuestas nuevas. El test de `PATCH`/`DELETE` con id mal formado (R1) y los casos `?q=` y `?q=%20` (R2) están en `routes.test.ts` y pasan; solo se tocó ese archivo.

Comprobado sin hallazgos (primera vuelta): permisos en la API (`onRequest` autenticado + `requireRole` en escritura), códigos 400/404/409 y mensajes, `switch` exhaustivo sin `default`, `deleteAuthor` traduce `23001`/`23503` a `has_books` (hoy solo puede venir de `book_authors`), `createBook` inserta en `book_authors` solo si hay `authorIds`, escape de `%`, `_` y `\`, orden `name, id`, sin datos sensibles en respuestas, DTOs desde `@jarvis/schemas` sin duplicar, `CLAUDE.md` de la app al día.

## Cierre

**Documentado**
- `apps/api/CLAUDE.md`: estructura (`modules/`, `http-errors.ts`, `db/errors.ts`, `db/search.ts`), patrones «Módulos (ruta → servicio → resultado explícito)» y «Listados con búsqueda y paginación»; eliminado «Pendiente de decidir». Hecho durante 9.2 y 9.3.
- `fase-1-plan.md`: tarea 9 marcada `[x]` y nota con el patrón de referencia, las piezas reutilizables y el contrato de `q` vacío.
- Sin cambios en `docs/dominio.md` (las reglas de autores ya estaban) ni en `.env.example` (sin variables nuevas).

**Deuda y pendientes**
- Tarea 10: valorar un CRUD genérico para entidades con solo `name` (géneros y sagas) antes de copiar `authors` dos veces.
- Tarea 11: usar `isForeignKeyViolation` para ids de autor/género inexistentes (→ 400) y `DbOrTx` en la transacción del alta; añadir el test pendiente de `SagaOrderSchema`.
- Tarea 12: valorar índices para `ILIKE` solo si el listado de libros lo necesita.
- Web (tareas 17-18): omitir `q` cuando la caja de búsqueda esté vacía (la API responde 400).
- `users`, `auth` y `health` siguen sin `service.ts`; se extraerá solo si crecen.


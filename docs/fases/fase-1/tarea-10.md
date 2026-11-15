# Tarea 10 — Géneros y sagas

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

CRUD de géneros (`/genres`) y de sagas (`/sagas`) con los mismos permisos, códigos y listado que autores, más el detalle de saga con sus libros ordenados por su orden en la saga. Al terminar solo faltan los libros (tareas 11 y 12) para completar la biblioteca en la API.

## Decisiones

- **Copiar el patrón de `authors/`, no extraer un CRUD genérico** — después de esta tarea no hay más entidades «solo nombre» en el plan, y una fábrica genérica sobre tablas de Drizzle y esquemas Zod se lee peor que tres módulos iguales mientras se aprende el patrón. Si en otra fase aparece una cuarta, se extrae con tres casos reales delante (deuda asumida: ~250 líneas repetidas).
- **Esquemas Zod por entidad (`genre.ts`, `saga.ts`), copia de los de `author.ts`** — mismo motivo; `PaginationQuerySchema` sí se reutiliza.
- **Géneros sin detalle con libros** — sus libros se verán con el filtro `?genero=` del listado de libros (tarea 12). `GET /genres/:id` devuelve `Genre` plano, como autores.
- **Saga: `GET /sagas/:id` devuelve `{ id, name, books }`** con el `BookSchema` plano ya existente (sin autores ni géneros, que llegan con la tarea 11). `POST` y `PATCH` devuelven la saga plana `{ id, name }`; el listado `GET /sagas` devuelve solo `{ sagas, total }`, sin libros ni `bookCount`.
- **Orden de los libros en la saga:** `sagaOrder` ascendente con los `null` al final (`NULLS LAST`), luego `title` y luego `id`. Dos libros con el mismo orden (edición ómnibus, ver `docs/dominio.md`) quedan en un orden estable. Sin paginación: una saga tiene como mucho decenas de libros.
- **Permisos, códigos y mensajes como en autores** (ver `tarea-9.md`): leer admin/adult/guest, escribir admin/adult; nombre repetido sin distinguir mayúsculas → 409; borrar con libros → 409; id inexistente → 404; id mal formado o nombre vacío → 400. Mensajes en español con el género gramatical correcto.
- **El servicio sigue el mismo molde:** funciones sueltas `fn(db: DbOrTx, ...)`, resultado explícito (`ok | not_found | name_taken | has_books`), sin consultar antes y capturando `isUniqueViolation` / `isForeignKeyViolation`.
- **Dos subtareas:** géneros (copia fiel de autores, más los helpers de test) y sagas (lo único nuevo es el detalle), para revisar cada una de una sentada.

## Especificación

Todas las rutas con `onRequest: app.authenticate` en el plugin y `security: sessionSecurity`; las de escritura con `preHandler: requireRole('admin', 'adult')`. Tags OpenAPI `genres` y `sagas`.

### Endpoints

| Método y ruta         | Roles               | Cuerpo / query                              | Respuestas                                             |
| --------------------- | ------------------- | ------------------------------------------- | ------------------------------------------------------ |
| `GET /genres`         | admin, adult, guest | query: `q?`, `limit?`, `offset?`            | 200 `{ genres: Genre[], total }`; 400; 401             |
| `GET /genres/:id`     | admin, adult, guest | —                                           | 200 `Genre`; 400; 401; 404                             |
| `POST /genres`        | admin, adult        | `{ name }` (`GenreNameSchema`)              | 201 `Genre`; 400; 401; 403; 409 nombre repetido        |
| `PATCH /genres/:id`   | admin, adult        | `{ name }`                                  | 200 `Genre`; 400; 401; 403; 404; 409 nombre repetido   |
| `DELETE /genres/:id`  | admin, adult        | —                                           | 204; 400; 401; 403; 404; 409 tiene libros              |
| `GET /sagas`          | admin, adult, guest | query: `q?`, `limit?`, `offset?`            | 200 `{ sagas: Saga[], total }`; 400; 401               |
| `GET /sagas/:id`      | admin, adult, guest | —                                           | 200 `SagaDetail`; 400; 401; 404                        |
| `POST /sagas`         | admin, adult        | `{ name }` (`SagaNameSchema`)               | 201 `Saga`; 400; 401; 403; 409 nombre repetido         |
| `PATCH /sagas/:id`    | admin, adult        | `{ name }`                                  | 200 `Saga`; 400; 401; 403; 404; 409 nombre repetido    |
| `DELETE /sagas/:id`   | admin, adult        | —                                           | 204; 400; 401; 403; 404; 409 tiene libros              |

- `limit` 1–200 (def. 50), `offset` ≥ 0 (def. 0), `q` 1–200 caracteres tras `trim`; `total` cuenta los que cumplen `q`, sin `limit`/`offset`. Orden por `name` y luego `id`.
- Mensajes: `Género no encontrado`, `Ya existe un género con ese nombre`, `No se puede borrar: el género tiene libros`; `Saga no encontrada`, `Ya existe una saga con ese nombre`, `No se puede borrar: la saga tiene libros`.
- Renombrar al mismo nombre, o cambiando solo las mayúsculas del propio, es válido (200).

### Servicios

`modules/genres/service.ts`: `listGenres(db, query)` → `{ genres, total }` · `getGenre(db, id)` → `Genre | undefined` · `createGenre` → `ok | name_taken` · `updateGenre` → `ok | not_found | name_taken` · `deleteGenre` → `ok | not_found | has_books`.

`modules/sagas/service.ts`: igual con `Saga` (`listSagas`, `createSaga`, `updateSaga`, `deleteSaga`) y

- `getSaga(db, id)` → `SagaDetail | undefined`. Lee la saga; si existe, lee sus libros (`where books.sagaId = id`, `orderBy sagaOrder asc nulls last, title, id`) con las columnas de `BookSchema`. Dos consultas, no un `JOIN`: más simple y el resultado no se multiplica por filas.

### Esquemas Zod (`packages/schemas/src/`)

- `genre.ts` — añadir `CreateGenreRequestSchema`, `UpdateGenreRequestSchema` (= Create), `GenreIdParamsSchema`, `GenreListQuerySchema`, `GenreListResponseSchema` (`{ genres, total }`) y tipos inferidos, copia de `author.ts`.
- `saga.ts` — lo mismo para saga (`{ sagas, total }`) más `SagaDetailSchema = SagaSchema.extend({ books: z.array(BookSchema) })` y su tipo. Importa `BookSchema` de `book.js` (sin ciclo: `book.ts` no importa `saga.ts`).

### Otros

- `test/helpers.ts`: `createGenre({ name? })` y `createSaga({ name? })` (nombre único por defecto, `testDb`); `createBook` acepta además `genreIds`, `sagaId` y `sagaOrder`.
- `app.ts`: registrar `genreRoutes` y `sagaRoutes`.
- `apps/api/CLAUDE.md`: «Estructura» añade `genres` y `sagas` a la lista de módulos.
- Sin migración: las tablas y los índices únicos `lower(name)` ya existen desde la tarea 8.

## Archivos

- `packages/schemas/src/genre.ts` — modificar: DTOs.
- `packages/schemas/src/saga.ts` — modificar: DTOs y `SagaDetailSchema`.
- `apps/api/src/test/helpers.ts` — modificar: `createGenre`, `createSaga`, opciones de `createBook`.
- `apps/api/src/modules/genres/service.ts` — crear.
- `apps/api/src/modules/genres/routes.ts` — crear.
- `apps/api/src/modules/genres/routes.test.ts` — crear.
- `apps/api/src/modules/sagas/service.ts` — crear.
- `apps/api/src/modules/sagas/routes.ts` — crear.
- `apps/api/src/modules/sagas/routes.test.ts` — crear.
- `apps/api/src/app.ts` — modificar: registrar las dos rutas.
- `apps/api/CLAUDE.md` — modificar: lista de módulos.

## Subtareas

- [x] **10.1 — Géneros:** DTOs de `genre.ts`, `createGenre` y la ampliación de `createBook` en helpers, módulo `genres` (`service.ts`, `routes.ts`) y registro en `app.ts`. Tests: los de la sección «Tests» para géneros.
- [x] **10.2 — Sagas:** DTOs y `SagaDetailSchema`, `createSaga` en helpers, módulo `sagas` con `getSaga` y su detalle, registro en `app.ts` y `apps/api/CLAUDE.md`. Tests: los de «Tests» para sagas, incluido el orden del detalle.

## Tests

En `modules/genres/routes.test.ts` y `modules/sagas/routes.test.ts`, con `inject()` y Postgres real. Los casos de permisos son **(obligatorio)**. Los de géneros y los de sagas son los mismos salvo donde se indica; para «tiene libros» se vincula un libro con `createBook({ genreIds })` o `createBook({ sagaId })`.

**Permisos (obligatorio), en cada entidad**
- [x] sin token, las cinco rutas → 401
- [x] invitado hace GET del listado y del detalle → 200
- [x] invitado hace POST, PATCH y DELETE → 403 y la entidad no cambia ni se borra
- [x] adulto y admin crean, editan y borran → 201 / 200 / 204

**CRUD, en cada entidad**
- [x] POST crea, recorta espacios del nombre y devuelve 201 con `id` y `name`
- [x] POST con nombre vacío o solo espacios → 400
- [x] POST con un nombre que solo difiere en mayúsculas de uno existente → 409
- [x] GET `/:id` inexistente → 404; con id mal formado → 400
- [x] PATCH cambia el nombre; a un nombre usado por otra → 409; al mismo nombre o cambiando solo mayúsculas del propio → 200; inexistente → 404
- [x] DELETE sin libros → 204 y GET posterior → 404; inexistente → 404
- [x] DELETE con libros → 409, la entidad sigue existiendo y el libro sigue vinculado (obligatorio: regla de borrado)

**Listado, en cada entidad**
- [x] ordenado por nombre, con `total`
- [x] `q` filtra sin distinguir mayúsculas y `total` cuenta solo los coincidentes
- [x] `q=%` o `q=_` solo coincide con nombres que contienen ese carácter literal
- [x] `limit` y `offset` paginan sin repetir ni saltar (con `total` constante)
- [x] `limit=201`, `limit=0` u `offset=-1` → 400

**Detalle de saga (solo sagas)**
- [x] `GET /sagas/:id` devuelve `{ id, name, books }` con los campos de `BookSchema`
- [x] saga sin libros → `books: []`
- [x] los libros salen por `sagaOrder` ascendente aunque se creen en otro orden (incluye un `2.5` entre el 2 y el 3)
- [x] un libro de la saga sin `sagaOrder` sale después de los que lo tienen
- [x] dos libros con el mismo `sagaOrder` salen por título (títulos distintos, sin depender de la collation)
- [x] el detalle no incluye libros de otra saga ni libros sin saga
- [x] el listado `GET /sagas` no incluye `books`

## Conceptos nuevos

- **`ORDER BY … NULLS LAST`:** Postgres coloca los `NULL` al final en orden ascendente por defecto, pero se escribe explícito para que la intención se lea y no dependa del sentido de la ordenación.
- **Dos consultas en vez de `JOIN` para «padre con hijos»:** con un `JOIN` la saga se repetiría en cada fila de libro y habría que reagrupar; dos consultas simples devuelven el resultado ya con su forma (útil cuando el hijo es una lista acotada).
- **Duplicar antes que abstraer (regla de tres):** se copia el patrón mientras solo hay tres casos y se extrae cuando el patrón ya se ha visto repetirse con diferencias reales.

## Fuera de alcance

- Libros de un género o de una saga fuera del detalle de saga (autores, géneros del libro y estado de préstamo en él) — tareas 11 y 12 (`?genero=`, `?saga=`).
- Alta y cambio de saga u orden de un libro — tarea 11.
- CRUD genérico de entidades con solo `name` — descartado (ver «Decisiones»).
- `bookCount` en los listados — no se hace en ninguna entidad.

## Registro de implementación

### Subtarea 10.1 — Géneros

- Archivos: `packages/schemas/src/genre.ts` (DTOs), `apps/api/src/modules/genres/{service,routes,routes.test}.ts` (nuevos, copia fiel de `authors/`), `apps/api/src/test/helpers.ts` (`createGenre`; `createBook` acepta `genreIds`, `sagaId` y `sagaOrder`), `apps/api/src/app.ts` (registro de `genreRoutes`).
- Sin desviaciones de la especificación. Los casos de sagas de «Tests» (y el detalle) quedan para 10.2; `sagaId`/`sagaOrder` de `createBook` ya están, aún sin uso.
- Para la revisión: los datos de los tests se cambiaron a nombres de género (en el listado, `Novela negra` y `Relato NEGRA` para probar `q` sin depender de la collation); el resto de casos son los de autores.
- Verificado: format, typecheck, lint y `pnpm -r test` (178 tests) sin errores.

### Subtarea 10.2 — Sagas

- Archivos: `packages/schemas/src/saga.ts` (DTOs y `SagaDetailSchema`), `apps/api/src/modules/sagas/{service,routes,routes.test}.ts` (nuevos), `apps/api/src/test/helpers.ts` (`createSaga`), `apps/api/src/app.ts` (registro de `sagaRoutes`), `apps/api/CLAUDE.md` (lista de módulos).
- Sin desviaciones de la especificación. El módulo parte de una copia de `genres/` con la concordancia de género corregida (`Saga no encontrada`, `una saga`, `la saga tiene libros`). En el servicio, `getSaga` devuelve el detalle y la lectura plana es una función privada `getSagaFlat`; el orden usa `sql`… asc nulls last`` porque Drizzle no tiene helper para `NULLS LAST`.
- Para la revisión: los tests de borrado con libros comprueban el vínculo con `books.sagaId` (no hay tabla puente); los datos de los tests se cambiaron a nombres de saga.
- Verificado: format, typecheck, lint y `pnpm -r test` (214 tests) sin errores.

## Revisión

Resultado: lista para terminar. Typecheck, lint y `pnpm -r test` (214 tests) sin errores; todo lo de «Especificación» y «Tests» está hecho y los tests fallarían si se rompiera el orden del detalle, los permisos o la regla de borrado.

- [ ] (descartada: solo gusto, authors/ tiene lo mismo) **R1 · opcional · trivial · `apps/api/src/modules/sagas/routes.ts:1-9`, `genres/routes.ts:1-9`, `sagas/routes.test.ts:5-12`** — los imports de `@jarvis/schemas` (y `createSaga, createBook` del test) no están en orden alfabético → reordenarlos. Se lee mejor y se localiza antes un nombre; `authors/` tiene lo mismo, así que es gusto, no un fallo.

## Cierre

- Documentado: patrón «padre con hijos» y `NULLS LAST` en `apps/api/CLAUDE.md` (la lista de módulos ya incluía `genres` y `sagas`); notas de la tarea en `fase-1-plan.md`. `docs/dominio.md` ya recogía las reglas de género y saga; sin variables de entorno nuevas.
- Deuda: ~250 líneas repetidas entre `authors/`, `genres/` y `sagas/` (asumida; extraer con una cuarta entidad «solo nombre»). R1 (orden de imports) descartada.
- Para la tarea 11: reutilizar `createBook({ genreIds, sagaId, sagaOrder })`; decidir si el detalle de saga incluye autores y géneros de cada libro; `SagaOrderSchema` sigue sin test (deuda de la tarea 8).
- Conceptos nuevos añadidos: ninguno.

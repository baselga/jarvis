# Tarea 11 — Libros (CRUD)

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

CRUD de libros (`/books`, sin el listado, que es la tarea 12) con el mismo reparto de permisos que el resto de la biblioteca. El alta y la edición guardan el libro con sus autores, géneros y saga en una sola transacción; el detalle devuelve el libro con sus relaciones y su préstamo activo.

## Decisiones

- **`PATCH` parcial** — lo omitido no cambia y `null` borra el campo. Es más cómodo para el asistente (fase 3) y es el verbo que ya usan autores, géneros y sagas. `authorIds` y `genreIds`, si vienen, **sustituyen** el conjunto entero (no hay «añadir uno»). Un cuerpo sin ningún campo es 400.
- **`BookDetail` = `Book` plano + `authors`, `genres`, `saga` y `activeLoan`** — `activeLoan` es el préstamo sin devolver (`Loan | null`) y no un booleano: la web y el asistente ven a quién y desde cuándo sin otra petición. «Prestado» = `activeLoan !== null`. `sagaId` y `sagaOrder` siguen en el `Book` plano; `saga` aporta el nombre.
- **El detalle se lee con consultas separadas, no con un `JOIN` gigante** (libro con `leftJoin` a saga, autores, géneros, préstamo activo): como `getSaga`, evita multiplicar filas. Autores y géneros por `name` y `id`.
- **`POST` y `PATCH` devuelven el `BookDetail`** leído tras el `COMMIT` con `getBook`, para que la forma sea la misma en las tres rutas.
- **Ids inexistentes (autor, género o saga) → 400**, no 404 ni 409: el recurso de la URL existe, lo que falla es una referencia del cuerpo. El mensaje dice cuál (`Autor inexistente`, `Género inexistente`, `Saga inexistente`). Se detecta con `isForeignKeyViolation` dentro de la transacción (no se consulta antes) y se identifica la restricción por su nombre (`constraint_name` del error de `postgres`).
- **Ids repetidos en `authorIds`/`genreIds` se deduplican en silencio** (`new Set`): si no, la PK compuesta lanza `23505` y saldría un 500. Máximo 20 autores y 20 géneros por libro.
- **`sagaOrder` solo con saga** — en Zod (alta, y `sagaId: null` con `sagaOrder` no nulo en la edición) y, para el caso que Zod no ve (`PATCH` con `sagaOrder` sobre un libro sin saga), se captura la violación del `check` (`23514`) → 400. Al quitar la saga (`sagaId: null`) sin mandar `sagaOrder`, este se pone a `null` solo.
- **`updatedAt`** — `PATCH` siempre ejecuta el `UPDATE` de `books` (con `updatedAt: new Date()` aunque solo cambien las relaciones): así el `404` sale del propio `UPDATE ... RETURNING` y `updatedAt` no queda desfasado.
- **`BookDetail` y los DTOs en `packages/schemas/src/book-detail.ts`**, no en `book.ts`: `BookDetail` necesita `SagaSchema`, y `saga.ts` ya importa `book.ts`; meterlo en `book.ts` crearía un ciclo.
- **`GET /sagas/:id` se queda con libros planos** — la saga solo necesita título y orden; evita consultas por libro. (Resuelve la duda anotada en la tarea 10.)
- **Campos opcionales: vacío no vale, se manda `null`** (los esquemas de campo ya tienen `min(1)`); la web debe enviar `null` o no enviar el campo.
- **Se aprovecha para borrar** los restos de `sed -i` versionados `modules/sagas/routes.ts-e` y `routes.test.ts-e`.

## Especificación

Todas las rutas con `onRequest: app.authenticate` en el plugin y `security: sessionSecurity`; las de escritura con `preHandler: requireRole('admin', 'adult')`. Tag OpenAPI `books`.

### Endpoints

| Método y ruta       | Roles               | Cuerpo                    | Respuestas                                  |
| ------------------- | ------------------- | ------------------------- | ------------------------------------------- |
| `GET /books/:id`    | admin, adult, guest | —                         | 200 `BookDetail`; 400; 401; 404             |
| `POST /books`       | admin, adult        | `CreateBookRequest`       | 201 `BookDetail`; 400; 401; 403             |
| `PATCH /books/:id`  | admin, adult        | `UpdateBookRequest`       | 200 `BookDetail`; 400; 401; 403; 404        |
| `DELETE /books/:id` | admin, adult        | —                         | 204; 400; 401; 403; 404                     |

- Mensajes: `Libro no encontrado` (404); `Autor inexistente`, `Género inexistente`, `Saga inexistente` (400); `El orden en la saga necesita una saga` (400 del `check`).
- Borrar un libro borra en cascada sus filas de `book_authors`, `book_genres`, `loans` y `readings` (lo hace la BD).
- No hay 409: el libro no tiene nombre único. Un ISBN repetido es válido (dos ejemplares).

### Esquemas Zod (`packages/schemas/src/book-detail.ts`, exportar en `index.ts`)

- `BookIdParamsSchema = z.object({ id: z.uuid() })`.
- `CreateBookRequestSchema`: `title` (`BookTitleSchema`, obligatorio); `authorIds` y `genreIds` (`z.array(z.uuid()).max(20)`, por defecto `[]`); `sagaId` (`z.uuid().nullable()`, opcional); `sagaOrder` (`SagaOrderSchema.nullable()`, opcional); `isbn`, `year`, `language`, `location`, `notes` (su esquema de `book.ts`, `.nullable().optional()`). `.refine`: `sagaOrder` no nulo exige `sagaId` no nulo.
- `UpdateBookRequestSchema`: los mismos campos, todos opcionales y sin defaults (`authorIds` ausente = no tocar; `[]` = quitar todos). `title` no admite `null`. `.refine`: al menos un campo; `sagaId: null` no puede ir con `sagaOrder` no nulo.
- `BookDetailSchema = BookSchema.extend({ authors: z.array(AuthorSchema), genres: z.array(GenreSchema), saga: SagaSchema.nullable(), activeLoan: LoanSchema.nullable() })`.
- Tipos inferidos de los cuatro.

### Servicio (`modules/books/service.ts`)

Funciones sueltas `fn(db: DbOrTx, ...)`, resultado explícito:

- `getBook(db, id)` → `BookDetail | undefined`.
- `createBook(db, body)` → `{ status: 'ok'; book: BookDetail } | { status: 'invalid_reference'; entity: 'author' | 'genre' | 'saga' }`. Transacción (`db.transaction`) con tres pasos: insertar el libro, insertar `book_authors`, insertar `book_genres`. Si algo lanza, `ROLLBACK`: no queda un libro a medias. Lee el detalle tras el `COMMIT`.
- `updateBook(db, id, body)` → `ok | not_found | invalid_reference | saga_order_without_saga`. Transacción: `UPDATE books` (siempre, con `updatedAt`); si `authorIds`/`genreIds` vienen, `DELETE` de sus filas e `INSERT` del conjunto nuevo.
- `deleteBook(db, id)` → `ok | not_found`.

Como `createBook` recibe `DbOrTx`, abre una transacción propia solo si no viene ya dentro de una (si `db` ya es `tx`, Drizzle usa un `SAVEPOINT`); no es un caso que haga falta probar hoy.

### Otros

- `db/errors.ts`: `isCheckViolation(error)` (`23514`), con test en `errors.test.ts`.
- `http-errors.ts`: `badRequest(msg)` con la forma de `ErrorResponseSchema` (400 `Bad Request`).
- `test/helpers.ts`: `createLoan({ bookId, borrower?, loanedAt?, returnedAt? })` (préstamo con valores por defecto válidos; sin `returnedAt` = activo). `createBook` no cambia.
- `app.ts`: registrar `bookRoutes`.
- `apps/api/CLAUDE.md`: añadir `books` a la lista de módulos y `isCheckViolation` a `db/errors.ts`; patrón «relaciones N:M en transacción» (reemplazar el conjunto + deduplicar).
- Sin migración: todo el modelo existe desde la tarea 8.

## Archivos

- `packages/schemas/src/book-detail.ts` — crear: DTOs y `BookDetailSchema`.
- `packages/schemas/src/index.ts` — modificar: exportar `book-detail.js`.
- `apps/api/src/db/errors.ts` — modificar: `isCheckViolation`.
- `apps/api/src/db/errors.test.ts` — modificar: test de `isCheckViolation`.
- `apps/api/src/http-errors.ts` — modificar: `badRequest`.
- `apps/api/src/test/helpers.ts` — modificar: `createLoan`.
- `apps/api/src/modules/books/service.ts` — crear.
- `apps/api/src/modules/books/routes.ts` — crear.
- `apps/api/src/modules/books/routes.test.ts` — crear.
- `apps/api/src/app.ts` — modificar: registrar las rutas.
- `apps/api/CLAUDE.md` — modificar: módulos, errores y patrón.
- `apps/api/src/modules/sagas/routes.ts-e`, `routes.test.ts-e` — borrar (`git rm`): restos de `sed`.

## Subtareas

- [x] **11.1 — Detalle de libro:** `book-detail.ts` (los cuatro esquemas, aunque solo se use el de detalle y el de params), `createLoan` en helpers, `getBook`, `GET /books/:id`, registro en `app.ts` y borrado de los `-e`. Tests: permisos de lectura y forma del detalle.
- [x] **11.2 — Alta, edición y borrado:** `badRequest`, `isCheckViolation`, `createBook`/`updateBook`/`deleteBook` con transacción, las tres rutas y la documentación en `CLAUDE.md`. Tests: permisos de escritura, referencias inexistentes, rollback, deduplicado, `sagaOrder`.

## Tests

Todos con `inject()` sobre Postgres real (`routes.test.ts`). Obligatorios (permisos) marcados con **(obl.)**.

### 11.1

- [x] **(obl.)** sin token, las cuatro rutas de `/books` responden 401
- [x] **(obl.)** admin, adulto e invitado hacen `GET /books/:id` → 200
- [x] `GET /books/:id` devuelve el libro con sus autores y géneros ordenados por nombre, la saga `{ id, name }` y `sagaOrder`
- [x] libro sin autores, géneros ni saga → `authors: []`, `genres: []`, `saga: null`, `activeLoan: null`
- [x] libro con un préstamo sin devolver → `activeLoan` con `borrower` y `loanedAt`; con el préstamo devuelto → `activeLoan: null`
- [x] `GET /books/:id` con id inexistente → 404; con id mal formado → 400

### 11.2

- [x] **(obl.)** invitado hace `POST`, `PATCH` y `DELETE` → 403 y no cambia nada en la BD
- [x] **(obl.)** admin y adulto hacen `POST`, `PATCH` y `DELETE` → 201 / 200 / 204
- [x] `POST` con título y sin más campos → 201 con el detalle vacío; con todos los campos → 201 y `GET` posterior lo devuelve igual
- [x] `POST` con título vacío o ausente → 400
- [x] `POST` con `authorId` inexistente → 400 `Autor inexistente`; igual con género y con saga; en los tres casos **no queda ningún libro** en la BD (rollback)
- [x] `POST` con un autor válido y otro inexistente → 400 y el libro no existe (la transacción deshace el primero)
- [x] `POST` con ids repetidos en `authorIds` y `genreIds` → 201 con cada uno una sola vez
- [x] `POST` con 21 autores → 400
- [x] `POST` con `sagaOrder` sin `sagaId` → 400; `sagaOrder` 2.5 con saga → 201; `sagaOrder` 2.55 → 400 y `-1` → 400 (deuda de la tarea 8: `SagaOrderSchema`)
- [x] `POST` con ISBN con guiones y minúsculas → se guarda normalizado; con ISBN malformado → 400; con ISBN repetido → 201
- [x] `POST` con `language: "ES"` → se guarda `es`
- [x] `PATCH` solo con `title` → cambia el título y conserva autores, géneros y saga
- [x] `PATCH` con `authorIds` → sustituye el conjunto; con `[]` → quita todos; ausente → no los toca
- [x] `PATCH` con `isbn: null` → lo borra; con `{}` → 400; con `title: null` → 400
- [x] `PATCH` con `sagaId: null` → quita la saga y el orden; con `sagaId: null` y `sagaOrder: 1` → 400
- [x] `PATCH` con `sagaOrder` sobre un libro sin saga → 400 `El orden en la saga necesita una saga`
- [x] `PATCH` con `genreId` inexistente → 400 y el libro conserva sus géneros anteriores (rollback)
- [x] `PATCH` con id inexistente → 404
- [x] `DELETE` borra el libro y sus `book_authors`, `book_genres`, `loans` y `readings`, y no borra autores, géneros ni la saga
- [x] `DELETE` con id inexistente → 404
- [x] `isCheckViolation` reconoce `23514` (también dentro de `cause`) y no otros códigos

## Conceptos nuevos

- **Transacción con varias tablas:** el libro y sus filas de `book_authors`/`book_genres` se escriben juntos o ninguno; un id inexistente a mitad deshace todo con `ROLLBACK`.
- **Relación N:M («reemplazar el conjunto»):** en `PATCH`, borrar las filas del libro en la tabla intermedia e insertar las nuevas. Más simple que calcular diferencias, y válido porque la tabla intermedia no tiene datos propios.
- **`PATCH` parcial con `undefined` ≠ `null`:** «no tocar» frente a «borrar». En Zod, `.optional()` frente a `.nullable()`.
- **Errores de `check` en Postgres (`23514`):** una regla de la BD que Zod no puede ver sin conocer el estado actual se captura y se traduce a 400.
- **Evitar ciclos de importación en el paquete de esquemas:** el esquema compuesto va en un archivo aparte.

## Fuera de alcance

- Listado de libros, búsqueda y filtros → tarea 12.
- Prestar y devolver, historial de préstamos → tarea 13 (aquí solo se **lee** el préstamo activo).
- Lecturas → tarea 14.
- Autores, géneros y saga en el detalle de saga, o `bookCount` en los listados.
- Subir portadas o importar por ISBN.

## Registro de implementación

### 11.1 — Detalle de libro

- Creados: `packages/schemas/src/book-detail.ts` (los cuatro esquemas), `apps/api/src/modules/books/{service,routes,routes.test}.ts`.
- Modificados: `packages/schemas/src/index.ts`, `apps/api/src/app.ts` (registro), `apps/api/src/test/helpers.ts` (`createLoan`).
- Borrados con `git rm`: `modules/sagas/routes.ts-e` y `routes.test.ts-e`.
- Desviación: el test «sin token, las cuatro rutas responden 401» solo cubre `GET` hoy, porque `POST`/`PATCH`/`DELETE` no existen hasta 11.2 (sin ruta darían 404). **Hay que ampliarlo en 11.2.** Los permisos de lectura se parametrizaron con `it.each` por rol.
- Para la revisión: `getBook` lanza las consultas de autores, géneros, saga y préstamo con `Promise.all` tras leer el libro; `bookColumns` está duplicado respecto a `sagas/service.ts` (aviso de posible extracción). Los esquemas de `CreateBookRequest`/`UpdateBookRequest` no tienen tests propios aún (se ejercitan en 11.2).
- Verificado: typecheck, lint y 222 tests en verde.

### 11.2 — Alta, edición y borrado

- Creados: ninguno. Modificados: `db/errors.ts` (+ `isCheckViolation`, `constraintOf`), `db/errors.test.ts`, `http-errors.ts` (`badRequest`), `modules/books/{service,routes,routes.test}.ts`, `apps/api/CLAUDE.md` (módulos, errores y patrón «N:M en transacción»).
- Desviación: añadido `constraintOf(error)` en `db/errors.ts` (con test), que la especificación no listaba: es la forma de leer `constraint_name` para saber si falló el autor, el género o la saga.
- Desviación menor: la deduplicación pasa los uuid a minúsculas antes del `Set` (`z.uuid()` acepta mayúsculas y Postgres las iguala; si no, `A…` y `a…` darían `23505` → 500). Hay test.
- El test 401 de 11.1 se amplió a las cuatro rutas, como se anotó. Los tests de «rollback» comprueban la BD directamente (`books`, `book_authors`), no solo el 400.
- Para la revisión: la traducción de errores va en un `catch` fuera de `db.transaction` (el error ya deshizo la transacción al salir del callback); `updateBook` hace `getBook` tras el `COMMIT` y, si el libro desapareció en medio, devuelve `not_found`. `isCheckViolation` en `updateBook` no mira el nombre del `check` (`books` solo tiene uno).
- Verificado: `pnpm format`, typecheck, lint y 251 tests en verde.

## Revisión

Resultado: lista para terminar (segunda vuelta: R1 comprobada, sin propuestas nuevas); typecheck, lint y 253 tests en verde.

- [x] **R1 · recomendable · `apps/api/src/modules/books/routes.test.ts` (describe `PATCH`)** — solo se prueba el `PATCH` con género inexistente; faltan autor y saga inexistentes → añadir un test que cubra `PATCH` con `authorIds: [UNKNOWN_ID]` (`Autor inexistente`) y con `sagaId: UNKNOWN_ID` (`Saga inexistente`), comprobando que el libro no cambia. La saga falla en el `UPDATE` de `books` y los autores en el `INSERT` de `book_authors`: son rutas distintas hasta la misma traducción, y hoy un fallo en el mapa `referenceConstraints` para ellas pasaría desapercibido en `PATCH`. (aceptada)
- [ ] **R2 · opcional · `modules/books/service.ts:19` y `modules/sagas/service.ts:40`** — `bookColumns` está duplicado → extraerlo (p. ej. `getTableColumns(books)` o un módulo compartido). Evita que una columna nueva se olvide en uno de los dos. No es trivial (toca dos módulos); con solo dos usos también se puede dejar. (descartada: solo hay dos usos; se extrae si aparece un tercero en la tarea 12)

### Mejoras de la revisión

- **Segunda vuelta:** R1 verificada (`it.each` en `PATCH` cubre `authorIds` y `sagaId` inexistentes, y comprueba que el libro no cambia). Solo se tocó `routes.test.ts`; sin cambios nuevos en el código. Sin propuestas nuevas.

- **R1** aplicada: `routes.test.ts` (describe `PATCH`) con un `it.each` para `authorIds` y `sagaId` inexistentes → 400 `Autor inexistente` / `Saga inexistente`, y el libro (título, autores, saga y orden) queda igual. Solo se tocó ese archivo; sin desviaciones. R2 sigue descartada.
- Verificado: `pnpm format`, typecheck, lint y 253 tests en verde.

## Cierre

- **Documentado:** `apps/api/CLAUDE.md` (módulo `books`, `isCheckViolation`/`constraintOf`, `badRequest`, patrón «N:M en transacción»); `docs/dominio.md` (ISBN repetible, orden en saga solo con saga); «Notas» de `fase-1-plan.md` (tarea 11) y tarea marcada `[x]`.
- **Deuda / pendientes:**
  - `bookColumns` duplicado en `books/service.ts` y `sagas/service.ts`: extraer si la tarea 12 lo necesita (R2 descartada).
  - `UpdateBookRequest`/`CreateBookRequest` solo se ejercitan vía rutas, sin tests de esquema aislados.
  - La web (tarea 17) debe enviar `null` o no enviar los campos opcionales vacíos; vacío da 400.
- **Conceptos nuevos añadidos:** ninguno más (los de la sección ya cubren lo aparecido).

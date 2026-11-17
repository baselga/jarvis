# Tarea 12 — Listado de libros

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

`GET /books` con búsqueda (`q` en título y autores), filtros por autor, género, saga y préstamo, y paginación con total. Cada libro sale con sus relaciones (`BookDetail`), leídas en lote para no hacer consultas por libro. Es la base de la tabla de la web (tarea 17) y de la búsqueda del asistente.

## Decisiones

- **Cada elemento es un `BookDetail`** (libro + `authors`, `genres`, `saga`, `activeLoan`) — la tabla y el asistente necesitan autores y estado de préstamo; un solo tipo de libro para los clientes.
- **Relaciones en lote, no por libro (evitar N+1)** — se lee la página de libros y después autores, géneros, sagas y préstamos activos de todos a la vez con `inArray(..., ids)`: ~6 consultas sea cual sea el `limit`. `getBook` pasa a usar el mismo cargador (una lista de un libro).
- **Filtros con nombres en inglés, un valor cada uno, combinados con AND** — `authorId`, `genreId`, `sagaId`, `loaned`, coherente con el resto de la API.
- **Id de filtro inexistente → 200 con lista vacía**, no 400 — un filtro es una pregunta; «ninguno» es una respuesta válida (a diferencia de una referencia en el cuerpo de un `POST`).
- **`loaned` con `z.stringbool()`**, no `z.coerce.boolean()` — `coerce` convierte `"false"` en `true` (texto no vacío). Solo `true`/`false`; otro valor → 400.
- **Filtros sobre tablas relacionadas con `EXISTS`, no con `JOIN`** — un libro con dos autores que coinciden con `q` saldría dos veces (y `total` contaría de más) con un `JOIN`.
- **`q` busca en título y nombre de autor** (plan), con `ilike` + `containsPattern`. Vacío → 400, como en autores (la web lo omite si la caja está vacía).
- **Orden fijo: `title`, luego `id`** — desempate estable para que las páginas no se solapen. El orden dentro de una saga ya lo da `GET /sagas/:id`.
- **Búsqueda sin tildes fuera de alcance** — necesita la extensión `unaccent` y afectaría a los cuatro listados; queda como deuda para una tarea aparte.
- **`bookColumns` se extrae** (tercer uso, acordado en la revisión de la tarea 11): exportado desde `modules/books/service.ts` e importado en `modules/sagas/service.ts`.

## Especificación

### Endpoint

| Método y ruta | Roles               | Query           | Respuestas                        |
| ------------- | ------------------- | --------------- | --------------------------------- |
| `GET /books`  | admin, adult, guest | `BookListQuery` | 200 `BookListResponse`; 400; 401  |

En `modules/books/routes.ts`, tag `books`, `security: sessionSecurity`, `querystring: BookListQuerySchema`. Sin `requireRole` (el hook `authenticate` del plugin ya da 401).

### Esquemas Zod (`packages/schemas/src/book-detail.ts`, ya exportado en `index.ts`)

- `BookListQuerySchema = PaginationQuerySchema.extend({ q, authorId, genreId, sagaId, loaned })`:
  - `q`: `z.string().trim().min(1).max(200).optional()`.
  - `authorId`, `genreId`, `sagaId`: `z.uuid().optional()`.
  - `loaned`: `z.stringbool({ truthy: ['true'], falsy: ['false'] }).optional()` (comprobar la firma exacta en Zod 4; lo importante: solo `true`/`false`).
- `BookListResponseSchema = z.object({ books: z.array(BookDetailSchema), total: z.number().int().min(0) })`. `total` cuenta los libros que cumplen los filtros, sin `limit`/`offset`.
- Tipos `BookListQuery` y `BookListResponse`.

### Servicio (`modules/books/service.ts`)

- `export const bookColumns` (el actual, exportado); `sagas/service.ts` borra su copia y lo importa.
- `withRelations(db, books: Book[]): Promise<BookDetail[]>` (privada): si la lista está vacía devuelve `[]` sin consultar; si no, en `Promise.all` cuatro consultas con `inArray`:
  - autores: `book_authors` ⨝ `authors` donde `bookId IN ids`, orden `name, id`, agrupados por `bookId`;
  - géneros: igual con `book_genres` ⨝ `genres`;
  - sagas: `sagas` donde `id IN (sagaIds no nulos y únicos)` (sin consulta si no hay ninguno);
  - préstamos activos: `loans` donde `bookId IN ids AND returnedAt IS NULL`.
  Reparte con `Map` y conserva el orden de entrada de los libros. Libros sin relaciones → `[]` / `null`.
- `getBook(db, id)`: lee el libro y devuelve `(await withRelations(db, [book]))[0]`. Mismo resultado que hoy (sus tests no cambian).
- `listBooks(db, query): Promise<BookListResponse>`: construye `where = and(...)` con las condiciones presentes:
  - `q`: `or(ilike(books.title, p), exists(select 1 from book_authors ⨝ authors where book_authors.book_id = books.id and authors.name ilike p))` con `p = containsPattern(q)`;
  - `authorId`: `exists(select 1 from book_authors where book_id = books.id and author_id = $authorId)`;
  - `genreId`: igual con `book_genres`;
  - `sagaId`: `eq(books.sagaId, sagaId)`;
  - `loaned`: `exists` / `notExists` de `loans` con `book_id = books.id and returned_at is null`.
  En `Promise.all`: la página (`orderBy(books.title, books.id).limit().offset()`) y el `count()` con el mismo `where`; después `withRelations` sobre la página.

Las subconsultas correlacionadas se escriben con `exists(db.select(...).from(...).where(eq(bookAuthors.bookId, books.id)))` de Drizzle (o `sql` si Drizzle no lo permite limpio).

### Otros

- `apps/api/CLAUDE.md`: en «Listados con búsqueda y paginación», añadir filtros con `EXISTS` y `z.stringbool()` para booleanos de query; nuevo patrón «Relaciones en lote (N+1)» apuntando a `withRelations`; quitar de «Padre con hijos» la mención a `bookColumns` si la hay.
- Sin migración.

## Archivos

- `packages/schemas/src/book-detail.ts` — modificar: `BookListQuerySchema`, `BookListResponseSchema` y tipos.
- `apps/api/src/modules/books/service.ts` — modificar: exportar `bookColumns`, `withRelations`, `getBook` sobre él, `listBooks`.
- `apps/api/src/modules/books/routes.ts` — modificar: `GET /books`.
- `apps/api/src/modules/books/routes.test.ts` — modificar: tests del listado; el de 401 pasa a cinco rutas.
- `apps/api/src/modules/sagas/service.ts` — modificar: importar `bookColumns` y borrar la copia.
- `apps/api/CLAUDE.md` — modificar: patrones.

## Subtareas

- [x] **12.1 — todo:** esquemas, `withRelations` + `getBook` refactorizado, `listBooks`, ruta, extracción de `bookColumns` y documentación. Tests: los de abajo.

## Tests

Con `inject()` sobre Postgres real, en `modules/books/routes.test.ts` (`describe('GET /books')`). Obligatorios (permisos) marcados con **(obl.)**. Los títulos de prueba no deben depender de la collation (no ordenar nombres que solo difieren en mayúsculas).

- [x] **(obl.)** sin token, `GET /books` → 401 (se añade al test de 401 existente)
- [x] **(obl.)** admin, adulto e invitado hacen `GET /books` → 200
- [x] sin libros → `{ books: [], total: 0 }`
- [x] cada elemento trae autores y géneros ordenados por nombre, `saga` `{ id, name }` y `activeLoan` (igual que el detalle); un libro sin relaciones → `[]`, `[]`, `null`, `null`
- [x] los libros salen ordenados por título
- [x] `limit`/`offset`: `total` cuenta todos; dos páginas consecutivas no se solapan y juntas cubren todos
- [x] `limit=0`, `limit=201` u `offset=-1` → 400
- [x] `q` encuentra por título sin distinguir mayúsculas y por nombre de autor; no devuelve los que no coinciden
- [x] `q` que coincide con dos autores del mismo libro (o con título y autor) → el libro sale una vez y `total` es 1
- [x] `q` vacío (`q=`) → 400
- [x] `authorId`, `genreId` y `sagaId` devuelven solo los libros con esa relación
- [x] filtro con id inexistente → 200 `{ books: [], total: 0 }`; con id mal formado → 400
- [x] `loaned=true` → solo libros con préstamo sin devolver; `loaned=false` → los demás, incluido uno con un préstamo ya devuelto
- [x] `loaned=yes` → 400
- [x] filtros combinados (`q` + `genreId` + `loaned`) se aplican con AND y `total` lo refleja
- [x] los tests existentes de `GET /books/:id` y `GET /sagas/:id` siguen en verde tras el refactor

## Conceptos nuevos

- **Problema N+1:** leer una lista y luego hacer una consulta por elemento. Se evita cargando cada relación de una vez para toda la página (`WHERE book_id IN (...)`) y repartiendo en memoria con un `Map`.
- **Subconsultas `EXISTS` correlacionadas:** filtrar por una tabla relacionada sin `JOIN`, así no se duplican filas ni se infla el `COUNT`.
- **Booleanos en la query string:** todo llega como texto; `z.coerce.boolean()` da `true` para `"false"`. `z.stringbool()` interpreta `"true"`/`"false"` explícitamente.

## Fuera de alcance

- Búsqueda sin tildes (`unaccent`) en este y los demás listados → deuda, tarea aparte.
- Ordenación elegible (`sort`), filtros con varios valores, búsqueda por ISBN, saga o notas.
- Préstamos (prestar, devolver, historial) → tarea 13.
- Tabla de libros en la web → tarea 17.

## Registro de implementación

### 12.1 — todo

- Modificados: `packages/schemas/src/book-detail.ts` (`BookListQuerySchema`, `BookListResponseSchema` y tipos), `apps/api/src/modules/books/{service,routes,routes.test}.ts`, `apps/api/src/modules/sagas/service.ts` (importa `bookColumns`), `apps/api/CLAUDE.md` (filtros con `EXISTS`, `z.stringbool`, patrón «Relaciones en lote»). Sin archivos nuevos.
- Tests obligatorios primero: el 401 (ahora cinco rutas) y la lectura por rol fallaron con 404 antes de existir la ruta.
- Desviaciones menores: `loaned` lleva `.describe(...)` porque en `/docs` sale como `string` sin más (es un *codec*: OpenAPI ve el texto de entrada). `withRelations` usa un helper privado `groupByBook` y `loanColumns`; el `where` del listado está en `listWhere` + `matchesQuery` para que `listBooks` se lea igual que `listAuthors`.
- Para la revisión: `withRelations` hace 4 consultas en `Promise.all` (3 si ningún libro tiene saga) y conserva el orden de entrada; el orden de autores/géneros sale del `ORDER BY` global y se mantiene al agrupar. `getBook` pasa por el mismo cargador (sus tests no cambian). El test «cada libro trae sus relaciones igual que el detalle» compara cada elemento con `GET /books/:id`.
- Nota de entorno: el *watch* de `tsx` en el contenedor no detectó el cambio de `routes.ts` (eventos de archivo perdidos en Docker para Mac); hizo falta `docker compose restart api` para ver la ruta en `/docs`.
- Verificado: `pnpm format`, typecheck, lint y 271 tests en verde.

### Mejoras R1 y R2

- R1: el test de relaciones (`routes.test.ts`, ahora «cada libro trae solo sus relaciones, igual que el detalle») usa tres libros: dos con autor, género, saga y préstamo propios y distintos, y uno vacío. Se comprueba cada uno por separado además de compararlo con el detalle.
- R2: `loaned` con `case: 'sensitive'` en `packages/schemas/src/book-detail.ts`; `loaned=TRUE` → 400 añadido al test de valores inválidos.
- Verificado: `pnpm format`, typecheck, lint y 271 tests en verde.

## Revisión

Resultado: lista para terminar (segunda vuelta: R1 y R2 aplicadas y comprobadas; typecheck, lint, Prettier y 271 tests en verde; sin mejoras nuevas).

- [x] **R1 · recomendable · `apps/api/src/modules/books/routes.test.ts:146`** — Solo un libro tiene relaciones; el otro va vacío. Como `getBook` ahora usa `withRelations`, comparar con el detalle es circular, y un reparto cruzado entre libros (autores, saga o préstamo de un libro en otro) no se detectaría → dar al segundo libro su propio autor, género, otra saga y un préstamo, y comprobar que cada uno lleva solo lo suyo. Es justo lo nuevo de la tarea: el reparto con `Map`. (aceptada)
- [x] **R2 · opcional · `packages/schemas/src/book-detail.ts:96`** — `z.stringbool` no distingue mayúsculas por defecto: `loaned=TRUE` da 200, y la especificación dice «solo `true`/`false`» → añadir `case: 'sensitive'` o aceptar la tolerancia y dejarlo así. Inofensivo; es coherencia con la especificación. (aceptada)

## Cierre

- Documentado: patrones «Listados» (filtros con `EXISTS`, `z.stringbool`) y «Relaciones en lote» en `apps/api/CLAUDE.md`, y nota de entorno (*watch* de `tsx` en Docker para Mac) en «Cambiar el modelo»; nota de la tarea en `fase-1-plan.md`.
- Nuevo `docs/deuda.md`: la deuda de las notas del plan pasa ahí (y se quita de las notas); `/jarvis-finish` y `/jarvis-phase` lo mantienen y consultan. Resueltas y borradas: `bookColumns` duplicado (esta tarea) y `SagaOrderSchema` sin test (cubierto en la tarea 11).
- Deuda: búsqueda sin tildes (`unaccent`), apuntada en `docs/deuda.md`.
- Para la tarea 13: `withRelations` sirve para listar préstamos activos con su libro.

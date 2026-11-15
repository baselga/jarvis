# Tarea 8 — Modelo de la biblioteca

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

Existen en la BD las ocho tablas de la biblioteca (`authors`, `genres`, `sagas`, `books`, `book_authors`, `book_genres`, `loans`, `readings`) con sus restricciones, su migración, y los esquemas Zod de entidad y de campo en `@jarvis/schemas`. No hay endpoints: es la base sobre la que las tareas 9–14 montan cada CRUD sin volver a tocar el modelo.

## Decisiones

- **Fechas de préstamos y lecturas con `date` de Postgres** (sin hora), en JSON `"2026-11-15"` (`z.iso.date()`) — «lo terminé el día 3» no tiene hora, y un `timestamp` cambia de día según la zona horaria.
- **`createdAt`/`updatedAt` en todas las tablas principales, sin exponerlos en la API** — sirven para depurar; no exponerlos evita convertir `Date` a texto en cada ruta. `User` se queda como está. Las tablas intermedias no los llevan.
- **Nombres de autor, género y saga únicos sin distinguir mayúsculas** (índice único sobre `lower(name)`) — evita duplicados por error; las tareas 9–10 responden 409 con `isUniqueViolation`.
- **ISBN no único** — puede haber dos ejemplares del mismo libro.
- **Las reglas del dominio se garantizan también en la BD** (`CHECK`, índice único parcial, `ON DELETE`) — Zod da el 400 con mensaje útil; la BD es la última línea si algo se salta la API, y resuelve las carreras (doble préstamo simultáneo).
- **Fin de lectura opcional, pero al menos una de las dos fechas** — una lectura con inicio y sin fin es «lo estoy leyendo»; no existen lecturas sin ninguna fecha.
- **`saga_order` como `numeric(5,1)`** leído como número — exacto con decimales (2.5), a diferencia de `real`.
- **Idioma como código ISO 639-1 de dos letras en minúsculas**, sin lista cerrada — filtro fiable; la web mostrará el nombre.
- **ISBN guardado sin guiones ni espacios, 10 o 13 caracteres, sin validar el dígito de control** — demasiado estricto para ediciones antiguas.
- **`loaned_at` sin valor por defecto en la BD** — `CURRENT_DATE` usa la zona horaria del servidor (UTC en el contenedor); la fecha «de hoy» la decide la tarea 13.
- **Campos opcionales como `null`, no ausentes** (`.nullable()` en los esquemas de entidad) — el JSON tiene siempre la misma forma y coincide con lo que devuelve Drizzle.
- **Solo esquemas de entidad y de campo en esta tarea** — los DTOs (crear, editar, listados, libro con relaciones) se definen en la tarea de cada CRUD, con el endpoint delante.
- **Un archivo por entidad en `packages/schemas`** y un solo `library.ts` en el esquema Drizzle — los de Zod crecerán con los DTOs de cada tarea; las tablas se referencian entre sí y se leen mejor juntas.
- **Límites de longitud solo en Zod** (columnas `text`) — en Postgres `text` y `varchar(n)` rinden igual; cambiar un límite no exige migración.

## Especificación

### Tablas (`apps/api/src/db/schema/library.ts`)

Todas las claves primarias `uuid` con `defaultRandom()` salvo las tablas intermedias. `created_at`/`updated_at` como en `users` (`timestamptz`, `defaultNow()`, `$onUpdate`) en `authors`, `genres`, `sagas`, `books`, `loans` y `readings`.

**`authors`**, **`genres`**, **`sagas`** (idénticas):

| Columna | Tipo   | Notas    |
| ------- | ------ | -------- |
| `id`    | `uuid` | PK       |
| `name`  | `text` | not null |

Índice único `<tabla>_name_lower_idx` sobre `lower(name)`.

**`books`**

| Columna      | Tipo           | Notas                                               |
| ------------ | -------------- | --------------------------------------------------- |
| `id`         | `uuid`         | PK                                                  |
| `title`      | `text`         | not null                                            |
| `saga_id`    | `uuid`         | nullable, FK → `sagas.id` `ON DELETE RESTRICT`      |
| `saga_order` | `numeric(5,1)` | nullable, `mode: 'number'`                          |
| `isbn`       | `text`         | nullable                                            |
| `year`       | `integer`      | nullable                                            |
| `language`   | `text`         | nullable                                            |
| `location`   | `text`         | nullable                                            |
| `notes`      | `text`         | nullable                                            |

- `CHECK books_saga_order_needs_saga`: `saga_order IS NULL OR saga_id IS NOT NULL`.
- Índice `books_saga_id_idx` en `saga_id`.

**`book_authors`** / **`book_genres`**

| Columna                  | Tipo   | Notas                                          |
| ------------------------ | ------ | ---------------------------------------------- |
| `book_id`                | `uuid` | FK → `books.id` `ON DELETE CASCADE`            |
| `author_id` / `genre_id` | `uuid` | FK → `authors.id` / `genres.id` `ON DELETE RESTRICT` |

- PK compuesta `(book_id, author_id)` / `(book_id, genre_id)`.
- Índice en `author_id` / `genre_id` (la PK compuesta solo sirve para buscar por `book_id`).

**`loans`**

| Columna       | Tipo   | Notas                               |
| ------------- | ------ | ----------------------------------- |
| `id`          | `uuid` | PK                                  |
| `book_id`     | `uuid` | FK → `books.id` `ON DELETE CASCADE` |
| `borrower`    | `text` | not null (texto libre)              |
| `loaned_at`   | `date` | not null, sin default               |
| `returned_at` | `date` | nullable                            |

- Índice único parcial `loans_active_book_idx` en `book_id` `WHERE returned_at IS NULL` (un solo préstamo activo por libro).
- `CHECK loans_returned_after_loaned`: `returned_at IS NULL OR returned_at >= loaned_at`.
- Índice `loans_book_id_idx` en `book_id`.

**`readings`**

| Columna       | Tipo       | Notas                                |
| ------------- | ---------- | ------------------------------------ |
| `id`          | `uuid`     | PK                                   |
| `book_id`     | `uuid`     | FK → `books.id` `ON DELETE CASCADE`  |
| `user_id`     | `uuid`     | FK → `users.id` `ON DELETE RESTRICT` |
| `started_at`  | `date`     | nullable                             |
| `finished_at` | `date`     | nullable                             |
| `rating`      | `smallint` | nullable                             |
| `note`        | `text`     | nullable                             |

- `CHECK readings_rating_range`: `rating IS NULL OR rating BETWEEN 1 AND 5`.
- `CHECK readings_has_date`: `started_at IS NOT NULL OR finished_at IS NOT NULL`.
- `CHECK readings_finished_after_started`: `started_at IS NULL OR finished_at IS NULL OR finished_at >= started_at`.
- Índices `readings_book_id_idx` y `readings_user_id_idx`.

Las columnas `date` se leen como texto `YYYY-MM-DD` (`mode: 'string'`, el valor por defecto de Drizzle).

### Migración

`pnpm --filter @jarvis/api db:generate` → una sola migración nueva en `apps/api/drizzle/` (`0001_*.sql`). Revisar que el SQL contiene los `CHECK`, el `WHERE` del índice parcial, los índices sobre `lower(name)` y los `ON DELETE` correctos. No se edita `0000`.

### Esquemas Zod (`packages/schemas/src/`)

Esquemas de campo (se reutilizarán en los DTOs de las tareas 9–14):

| Esquema              | Definición                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `AuthorNameSchema`, `GenreNameSchema`, `SagaNameSchema` | `z.string().trim().min(1).max(200)`                         |
| `BookTitleSchema`    | `z.string().trim().min(1).max(300)`                                                          |
| `SagaOrderSchema`    | `z.number().min(0).max(9999.9).multipleOf(0.1)`                                              |
| `IsbnSchema`         | texto → quita guiones y espacios, mayúsculas → debe cumplir `^(\d{9}[\dX]|\d{13})$`          |
| `BookYearSchema`     | `z.int().min(0).max(2100)`                                                                   |
| `LanguageSchema`     | `z.string().trim().toLowerCase()` → `^[a-z]{2}$`                                             |
| `BookLocationSchema` | `z.string().trim().min(1).max(200)`                                                          |
| `BookNotesSchema`    | `z.string().trim().min(1).max(2000)`                                                         |
| `BorrowerSchema`     | `z.string().trim().min(1).max(100)`                                                          |
| `DateSchema`         | `z.iso.date()` (en `date.ts`; lo usan préstamos y lecturas)                                  |
| `RatingSchema`       | `z.int().min(1).max(5)`                                                                      |
| `ReadingNoteSchema`  | `z.string().trim().min(1).max(2000)`                                                         |

Esquemas de entidad (lo que devuelve la API; cada uno con su `type` inferido):

- `AuthorSchema`, `GenreSchema`, `SagaSchema`: `{ id: z.uuid(), name: z.string() }`.
- `BookSchema` (libro plano, sin relaciones embebidas): `{ id, title, sagaId: uuid | null, sagaOrder: number | null, isbn: string | null, year: number | null, language: string | null, location: string | null, notes: string | null }`.
- `LoanSchema`: `{ id, bookId, borrower, loanedAt: DateSchema, returnedAt: DateSchema | null }`.
- `ReadingSchema`: `{ id, bookId, userId, startedAt: DateSchema | null, finishedAt: DateSchema | null, rating: number | null, note: string | null }`.

Como en `UserSchema`, los esquemas de entidad no repiten las reglas de entrada (son `z.string()`, `z.number()`…): describen la salida, no validan lo que ya está guardado.

### Documentación

- `apps/api/CLAUDE.md`: en «Estructura», `src/db/schema/` menciona `library.ts`; en «Patrones», una línea sobre restricciones en la BD (`check`, índice único parcial, `lower(name)`) con referencia a `library.ts`, y que las fechas sin hora son `date` + `DateSchema`.
- `docs/dominio.md`: en «Lectura», la fecha de fin pasa a opcional (al menos una de las dos fechas; sin fin = «leyendo»). En «Autor/Género/Saga», que el nombre no se puede repetir (sin distinguir mayúsculas).

## Archivos

- `apps/api/src/db/schema/library.ts` — crear: las ocho tablas.
- `apps/api/src/db/schema/index.ts` — modificar: reexportar `library.js`.
- `apps/api/drizzle/0001_*.sql` y `apps/api/drizzle/meta/*` — generados por `db:generate`.
- `apps/api/src/db/schema/library.test.ts` — crear: tests de restricciones.
- `packages/schemas/src/date.ts` — crear: `DateSchema`.
- `packages/schemas/src/author.ts`, `genre.ts`, `saga.ts`, `book.ts`, `loan.ts`, `reading.ts` — crear: esquemas de campo y de entidad.
- `packages/schemas/src/index.ts` — modificar: reexportar los nuevos.
- `packages/schemas/src/book.test.ts`… — **no**: `packages/schemas` no tiene Vitest; los tests de `IsbnSchema`/`LanguageSchema` van en `apps/api/src/db/schema/library.test.ts` (ver «Tests»).
- `apps/api/CLAUDE.md`, `docs/dominio.md` — modificar: ver «Documentación».

## Subtareas

- [x] **8.1 — todo:** tablas, migración, esquemas Zod, tests de restricciones y documentación. Son muchos archivos, pero casi todos de pocas líneas y un único concepto (el modelo); dividirlo dejaría esquemas Zod sin tabla o al revés.

## Tests

Ninguno obligatorio (no hay auth, roles ni permisos). Se añaden porque las restricciones son SQL fácil de romper en una migración futura y las tareas 9–14 dependen de ellas. Insertan directamente con `testDb` (sin `inject()`), en `apps/api/src/db/schema/library.test.ts`:

- [x] dos autores «Asimov» y «asimov» → violación de unicidad (`isUniqueViolation`); lo mismo en género y saga
- [x] libro con `saga_order` y sin `saga_id` → falla el `CHECK`
- [x] `saga_order` 2.5 se guarda y se lee como el número `2.5`
- [x] segundo préstamo activo del mismo libro → violación de unicidad; tras devolver el primero, se puede prestar otra vez
- [x] préstamo con `returned_at` anterior a `loaned_at` → falla el `CHECK`
- [x] lectura con `rating` 0 o 6 → falla; sin ninguna fecha → falla; con fin anterior al inicio → falla; solo con inicio → se guarda
- [x] borrar un libro borra sus préstamos, lecturas y filas de `book_authors`/`book_genres`
- [x] borrar un autor, género o saga con libros → falla (violación de clave foránea); sin libros → se borra
- [x] las fechas se leen como texto `YYYY-MM-DD`
- [x] `IsbnSchema`: `"978-84-376-0494-7"` → `"9788437604947"`; `"84-376-0494-x"` → `"843760494X"`; 11 dígitos → error
- [x] `LanguageSchema`: `" ES "` → `"es"`; `"esp"` → error

## Conceptos nuevos

- **Relación N:M con tabla intermedia:** un libro tiene varios autores y al revés; se guarda una fila por pareja en `book_authors`, con clave primaria compuesta para que la pareja no se repita.
- **Clave foránea y `ON DELETE`:** la BD impide referencias a filas que no existen y decide qué pasa al borrar la fila referenciada: `CASCADE` (borra las hijas) o `RESTRICT` (impide el borrado).
- **Restricción `CHECK`:** condición que toda fila debe cumplir (valoración entre 1 y 5); la BD rechaza la escritura si no se cumple.
- **Índice único parcial:** unicidad solo entre las filas que cumplen un `WHERE` (un préstamo activo por libro, los devueltos no cuentan).
- **Índice sobre una expresión:** unicidad sobre `lower(name)` en vez de sobre la columna, para ignorar mayúsculas.
- **`date` frente a `timestamptz`:** un día de calendario sin hora ni zona frente a un instante exacto; elegir mal provoca errores de «un día menos».
- **`numeric` frente a `real`:** decimal exacto frente a coma flotante aproximada.
- **Índices en claves foráneas:** Postgres no los crea solo; sin ellos, buscar «libros de este autor» o comprobar un `RESTRICT` recorre toda la tabla.

## Fuera de alcance

- Endpoints y DTOs de petición/respuesta — tareas 9–14 (cada CRUD define los suyos).
- Traducir violaciones de `CHECK`/clave foránea a códigos HTTP (helpers tipo `isForeignKeyViolation`) — tareas 9 (409 al borrar con libros) y 11 (400 con ids inexistentes).
- Estructura de módulos de rutas — tarea 9.
- Exponer `createdAt`/`updatedAt` en la API — no previsto en esta fase.
- Índices para la búsqueda `ILIKE` — tarea 12, si hicieran falta.
- Helpers de test `createBook`, `createAuthor`… — tarea 9 en adelante, cuando haya tests de rutas que los usen (aquí se inserta a mano).

## Registro de implementación

**8.1 — todo.** Creados: `apps/api/src/db/schema/library.ts`, `library.test.ts`, `drizzle/0001_lame_korath.sql` (+ `meta`), `packages/schemas/src/{date,author,genre,saga,book,loan,reading}.ts`. Modificados: `db/schema/index.ts`, `packages/schemas/src/index.ts`, `apps/api/CLAUDE.md`, `docs/dominio.md`. Typecheck, lint y 113 tests en verde; SQL revisado (CHECK, índice parcial, `lower(name)`, `ON DELETE`).

Desviaciones y puntos para la revisión:
- **`ON DELETE RESTRICT` da `23001` (`restrict_violation`), no `23503`.** Los tests de borrado lo comprueban con `23001`. Las tareas 9 y 11 deben detectar ambos códigos (23001 al borrar con libros; 23503 con ids inexistentes). Anotado en `apps/api/CLAUDE.md`.
- `loans` lleva `created_at`/`updated_at` (la especificación lo dice en el texto general, no en la tabla).
- Los tests de `IsbnSchema`/`LanguageSchema` van en `library.test.ts`, como indica la especificación.

## Revisión

Resultado: lista para terminar

Typecheck, lint, Prettier y 113 tests en verde. Todo lo de «Especificación» y «Tests» está hecho: SQL de la migración con los `CHECK`, el índice parcial, los `lower(name)` y los `ON DELETE` correctos; `0000` intacta; docs actualizadas. Los tests fallarían si se rompiera una restricción (comprueban el código de Postgres, no solo que «falla»). Sin endpoints, así que no hay datos sensibles ni permisos que revisar.

- [ ] **R1 · opcional · `apps/api/src/db/schema/library.test.ts`** (descartada: se hará en la tarea 11, con el DTO de libro) — `SagaOrderSchema` no tiene test. Comprobado a mano que acepta 0.3, 2.3 y 9999.9 y rechaza 0.15, así que `multipleOf(0.1)` no da falsos rechazos por coma flotante → añadir un test de ese caso. No es trivial (test nuevo) y no estaba en la especificación; puede esperar a la tarea 11, donde llega el DTO de libro.

## Cierre

Documentado:
- `apps/api/CLAUDE.md`: `library.ts` en la estructura y patrón «Reglas en la BD además de en Zod» (incluye el `23001` de `RESTRICT`).
- `docs/dominio.md`: nombres únicos sin distinguir mayúsculas y lectura con fin opcional.
- `fase-1-plan.md`: tarea marcada y nota para las tareas 9 y 11.

Deuda: test de `SagaOrderSchema` (tarea 11); helper para `23001`/`23503` (tareas 9 y 11).

Conceptos nuevos añadidos: ninguno más; `RESTRICT` frente a `NO ACTION` (`23001` frente a `23503`) queda en la nota de `apps/api/CLAUDE.md`.

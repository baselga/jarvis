# Tarea 13 — Préstamos

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

Prestar un libro a alguien, registrar su devolución, consultar el historial de préstamos de un libro y ver qué libros están fuera de casa. Lo usarán el detalle de libro de la web (tarea 19) y, más adelante, el asistente.

## Decisiones

- **Módulo propio `modules/loans/`**, aunque una de sus rutas cuelgue de `/books/:id` — el préstamo tiene su propia lógica (409, devolución) y no engorda `books/`.
- **Devolver es una ruta de acción (`POST /loans/:id/return`), no un `PATCH /loans/:id` genérico** — devolver tiene reglas (solo una vez) y la ruta deja clara la intención. Un `PATCH` obligaría a decidir qué campos se pueden editar y cuándo.
- **Fechas obligatorias en el cuerpo (`loanedAt`, `returnedAt`), sin valor por defecto ni comprobar que no sean futuras** — calcular «hoy» en la API exigiría configurar la zona horaria de casa (`CURRENT_DATE` usa la del servidor, normalmente UTC). El cliente ya sabe qué día es para el usuario.
- **Sin consultar antes de escribir:** el doble préstamo lo detecta el índice único parcial `loans_active_book_idx` (`isUniqueViolation` → 409) y un libro inexistente, la clave foránea (`isForeignKeyViolation` → 404) — mismo patrón que la unicidad en `users`/`authors`, sin carreras entre dos peticiones.
- **Devolución con `UPDATE … WHERE id = $1 AND returned_at IS NULL RETURNING`** — es atómico: si dos peticiones devuelven a la vez, solo una actualiza. Si no actualiza ninguna fila, una segunda consulta distingue entre 404 (no existe) y 409 (ya devuelto).
- **Devolución anterior al préstamo → 400 por el `check` `loans_returned_after_loaned`** (`isCheckViolation`) — Zod no conoce el `loanedAt` guardado.
- **Préstamos activos con el libro completo (`BookDetail` vía `withRelations`), sin paginar** — la web y el asistente necesitan título y autores. Serán pocos. El `activeLoan` del libro repite el préstamo; se acepta para reutilizar el esquema.
- **Sin editar ni borrar préstamos** — fuera del plan. Se apunta en `docs/deuda.md`.

## Especificación

### Esquemas (`packages/schemas/src/loan-detail.ts`, nuevo)

Archivo aparte de `loan.ts` porque `book-detail.ts` importa `loan.ts`, y `ActiveLoanSchema` necesita `BookDetailSchema`: así se evita un import circular.

- `LoanIdParamsSchema = z.object({ id: z.uuid() })` + tipo.
- `CreateLoanRequestSchema = z.object({ borrower: BorrowerSchema, loanedAt: DateSchema })` + tipo.
- `ReturnLoanRequestSchema = z.object({ returnedAt: DateSchema })` + tipo.
- `BookLoansResponseSchema = z.object({ loans: z.array(LoanSchema) })` + tipo.
- `ActiveLoanSchema = LoanSchema.extend({ book: BookDetailSchema })` + tipo.
- `ActiveLoansResponseSchema = z.object({ loans: z.array(ActiveLoanSchema) })` + tipo.
- Reexportar desde `index.ts`.

### Rutas (`tags: ['loans']`, `security: sessionSecurity`, `app.authenticate` como hook del plugin)

| Método y ruta | Roles | Cuerpo | Respuestas |
|---|---|---|---|
| `POST /books/:id/loans` | admin, adult | `CreateLoanRequest` | 201 `Loan` · 400 validación · 401 · 403 · 404 «Libro no encontrado» · 409 «El libro ya está prestado» |
| `POST /loans/:id/return` | admin, adult | `ReturnLoanRequest` | 200 `Loan` · 400 validación o «La devolución no puede ser anterior al préstamo» · 401 · 403 · 404 «Préstamo no encontrado» · 409 «El préstamo ya está devuelto» |
| `GET /books/:id/loans` | cualquiera con sesión | — | 200 `BookLoansResponse` · 400 id no uuid · 401 · 404 «Libro no encontrado» |
| `GET /loans/active` | cualquiera con sesión | — | 200 `ActiveLoansResponse` · 401 |

- **Orden del historial:** `loanedAt desc, createdAt desc, id`: el más reciente primero. Si hay dos el mismo día, va antes el último registrado. Un libro sin préstamos → `{ loans: [] }`. Un libro inexistente → 404: se comprueba que existe, porque la lista vacía no lo distingue.
- **Orden de los activos:** `loanedAt asc, createdAt asc, id`: primero el que más tiempo lleva fuera.
- `returnedAt` igual a `loanedAt` es válido (prestado y devuelto el mismo día).
- Tras devolverlo, el libro se puede volver a prestar: el índice parcial solo cuenta los préstamos sin devolver.

### Servicio (`modules/loans/service.ts`)

Funciones `fn(db: DbOrTx, …)` con resultado explícito, como en `authors/`:

- `createLoan(db, bookId, data)` → `ok` (con el `Loan`) | `book_not_found` | `already_loaned`.
- `returnLoan(db, id, returnedAt)` → `ok` | `not_found` | `already_returned` | `returned_before_loaned`.
- `listBookLoans(db, bookId)` → `ok` (con `loans`) | `book_not_found`.
- `listActiveLoans(db)` → `ActiveLoan[]` usando `withRelations` (exportarlo desde `books/service.ts`) y `loanColumns` (exportar o reutilizar el de `books/service.ts`).

## Archivos

- `packages/schemas/src/loan-detail.ts` — crear: DTOs de préstamos.
- `packages/schemas/src/index.ts` — modificar: reexportar `loan-detail.ts`.
- `apps/api/src/modules/books/service.ts` — modificar: exportar `withRelations` (y `loanColumns`).
- `apps/api/src/modules/loans/service.ts` — crear.
- `apps/api/src/modules/loans/routes.ts` — crear.
- `apps/api/src/modules/loans/routes.test.ts` — crear.
- `apps/api/src/app.ts` — modificar: registrar `loanRoutes`.
- `apps/api/CLAUDE.md` — modificar: añadir `loans` a la lista de módulos y una línea sobre «ruta de acción + `UPDATE` condicional».
- `docs/deuda.md` — modificar: mejora posible «no se pueden corregir ni borrar préstamos».

## Subtareas

- [x] **13.1 — todo:** esquemas, servicio, rutas, tests y documentación. Tests: los de abajo.

## Tests

Obligatorios (permisos):
- [x] sin sesión, `POST /books/:id/loans`, `POST /loans/:id/return`, `GET /books/:id/loans` y `GET /loans/active` → 401
- [x] invitado hace `POST /books/:id/loans` → 403 (y no se crea el préstamo)
- [x] invitado hace `POST /loans/:id/return` → 403 (y el préstamo sigue activo)
- [x] invitado ve `GET /books/:id/loans` y `GET /loans/active` → 200
- [x] adulto y admin prestan → 201
- [x] prestar un libro ya prestado → 409

Prestar:
- [x] el 201 devuelve `borrower` sin espacios sobrantes, `loanedAt` y `returnedAt: null`, y `GET /books/:id` muestra ese `activeLoan`
- [x] libro inexistente → 404
- [x] `borrower` vacío o solo espacios, sin `loanedAt` o con fecha inválida → 400

Devolver:
- [x] devolver → 200 con `returnedAt`; después `activeLoan` es `null` y el libro se puede volver a prestar (201)
- [x] devolver el mismo día del préstamo → 200
- [x] devolver dos veces → 409
- [x] préstamo inexistente → 404
- [x] `returnedAt` anterior a `loanedAt` → 400

Consultas:
- [x] el historial devuelve solo los préstamos de ese libro, del más reciente al más antiguo
- [x] libro sin préstamos → `{ loans: [] }`; libro inexistente → 404
- [x] activos: solo los no devueltos, del más antiguo al más reciente, cada uno con su `book` (título y autores)

## Conceptos nuevos

- **Ruta de acción (`POST /recurso/:id/accion`):** para operaciones con reglas propias (devolver, cancelar…) en lugar de un `PATCH` genérico. La intención y los errores posibles quedan explícitos en la API.
- **`UPDATE` condicional como control de concurrencia:** poner la condición de estado en el `WHERE` (`returned_at IS NULL`) y mirar cuántas filas cambiaron. Es atómico, sin leer antes ni bloquear.
- **Índice único parcial como regla de negocio:** «un solo préstamo activo por libro» lo garantiza la BD (`WHERE returned_at IS NULL`). La API solo traduce el error a 409.

## Fuera de alcance

- Editar o borrar préstamos (corregir errores): apuntado en `docs/deuda.md`.
- Fecha por defecto «hoy» y zona horaria de casa: si el asistente lo necesita, se decide en su fase.
- Interfaz de préstamos en la web: tarea 19.

## Registro de implementación

### 13.1 — todo

- **Archivos:** creados `packages/schemas/src/loan-detail.ts`, `apps/api/src/modules/loans/{service,routes,routes.test}.ts`; modificados `packages/schemas/src/index.ts`, `apps/api/src/modules/books/service.ts` (exporta `withRelations` y `loanColumns`), `apps/api/src/app.ts`, `apps/api/CLAUDE.md`, `docs/deuda.md`.
- **Sin desviaciones** de la especificación.
- **Detalles a mirar:**
  - `listActiveLoans` lee préstamo y libro en una sola consulta con `JOIN` y selección anidada (`{ loan: loanColumns, book: bookColumns }`): aquí el `JOIN` no repite filas (un préstamo → un libro). Después `withRelations` sobre los libros, que conserva el orden.
  - `returnLoan`: si `returnedAt` es anterior y el préstamo ya estaba devuelto, el `WHERE` no casa ninguna fila y sale 409 (no 400): el `check` solo salta si el `UPDATE` llega a escribir.
  - `listBookLoans` lanza la comprobación del libro y el historial en paralelo (`Promise.all`).
  - Tests extra: `loanedAt` con hora → 400; el desempate por `createdAt` cuando hay dos préstamos el mismo día.

### Mejora R1

- **Archivos:** `apps/api/src/modules/loans/routes.test.ts`.
- `it.each` de 400 en `POST /loans/:id/return` (sin `returnedAt`, fecha inválida, fecha con hora, id no uuid) y un test de id no uuid en `GET /books/:id/loans`. Sin desviaciones; 299 tests en verde.

## Revisión

Resultado: lista para terminar

Segunda vuelta: R1 aplicada y comprobada (400 de validación en la devolución e id no uuid en el historial); typecheck, lint, formato y tests (299) en verde. Sin mejoras nuevas.

Primera vuelta: cumple la especificación y los tests obligatorios; typecheck, lint, formato y tests (294) en verde. Sin bugs ni fallos de permisos. `returnLoan` y `createLoan` siguen el patrón «escribir y traducir el error» sin carreras.

- [x] **R1 · opcional · `apps/api/src/modules/loans/routes.test.ts:227`** (aceptada) — no hay test de 400 por validación en `POST /loans/:id/return` (sin `returnedAt`, fecha inválida o id no uuid) ni de id no uuid en `GET /books/:id/loans` → añadir un `it.each` como el de prestar. La tabla de la especificación promete esos 400, aunque la lista de tests no los pedía.
- [x] **R2 · opcional · trivial · `apps/api/src/modules/books/service.ts:37` y `apps/api/CLAUDE.md` (patrón «Relaciones en lote»)** (aceptada) — el comentario de `bookColumns` y la línea del `CLAUDE.md` solo citan a `sagas` como consumidor; ahora `loans` también usa `bookColumns` y `withRelations` → añadirlo en ambos. Que quien toque `books/service.ts` sepa que rompe préstamos.
- [x] **R3 · opcional · trivial · `apps/api/src/modules/loans/service.ts:77`** (aceptada) — `listActiveLoans` usa un `JOIN`, que el `CLAUDE.md` desaconseja para padre-hijos; el porqué solo está en el registro → una línea de comentario: «`JOIN` 1:1 (cada préstamo tiene un libro): no repite filas».

## Cierre

- **Documentado:** `apps/api/CLAUDE.md` (módulo `loans`, patrón «Acciones con reglas» y consumidores de `withRelations`/`bookColumns`); `docs/dominio.md` (regla de la devolución y préstamos no editables); nota de la tarea 13 en `fase-1-plan.md` (rutas y DTOs para la tarea 19).
- **Deuda (`docs/deuda.md`):** no se pueden corregir ni borrar préstamos; sin fecha por defecto «hoy» (zona horaria de casa), a decidir si el asistente lo necesita.
- **Pendientes para otras tareas:** la tarea 19 (detalle de libro en la web) debe enviar `loanedAt`/`returnedAt` con la fecha de hoy del usuario.

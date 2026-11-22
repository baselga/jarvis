# Tarea 20 — Corregir y borrar préstamos

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

Que un error al registrar un préstamo (prestatario, fechas, una devolución marcada por error o un préstamo que no debía existir) se pueda arreglar desde la API con `PATCH`/`DELETE /loans/:id`. Cierra la deuda «No se pueden corregir ni borrar préstamos» (tarea 13).

## Decisiones

- **Roles: admin y adulto; invitado 403** — es lo que ya dice `docs/dominio.md` («crear, editar y borrar esos datos»), igual que prestar y devolver.
- **`PATCH` libre: `borrower`, `loanedAt` y `returnedAt`, en cualquier estado** — es una herramienta de corrección; las reglas que importan (devolución ≥ préstamo, un solo activo por libro) las garantiza la BD sea cual sea la vía. `POST /loans/:id/return` sigue siendo la vía «normal» de devolver.
- **«Desdevolver» con `returnedAt: null`** — como en las lecturas: ausente = no tocar, `null` = vaciar. Corrige un «devuelto» marcado por error.
- **Dos préstamos activos los impide el índice único parcial `loans_active_book_idx`** — no se consulta antes: se hace el `UPDATE` y, si salta `23505`, 409. Atómico y sin carreras, igual que al prestar.
- **El libro (`bookId`) no se cambia** — cuerpo con `z.strictObject`: enviarlo da 400 en vez de ignorarlo en silencio (como `PATCH /auth/me`). Si el libro era otro: borrar y prestar de nuevo.
- **`DELETE` borra de verdad, esté activo o devuelto** — un préstamo registrado por error no es historia de la casa; no hay papelera ni auditoría.

## Especificación

### `UpdateLoanRequestSchema` (`packages/schemas/src/loan-detail.ts`)

```ts
z.strictObject({
  borrower: BorrowerSchema.optional(),
  loanedAt: DateSchema.optional(),
  returnedAt: DateSchema.nullable().optional(),
})
  .refine(/* al menos un campo !== undefined */, { message: 'Indica al menos un campo que cambiar' })
  .refine(/* si llegan loanedAt y returnedAt (no null), returnedAt >= loanedAt */, {
    message: 'La devolución no puede ser anterior al préstamo',
    path: ['returnedAt'],
  });
```

Comentario en el esquema: ausente = no tocar; `null` en `returnedAt` = vuelve a estar prestado; las reglas que dependen de lo guardado las comprueba la BD. Tipo `UpdateLoanRequest` exportado.

### `PATCH /loans/:id`

- Roles: `admin`, `adult` (`canWrite`). Params `LoanIdParamsSchema`, body `UpdateLoanRequestSchema`.
- `200` → `LoanSchema` con el préstamo actualizado.
- `400` → body inválido (vacío, clave desconocida como `bookId`, fechas mal formadas o `returnedAt < loanedAt` en el propio cuerpo) o `loans_returned_after_loaned` contra lo guardado («La devolución no puede ser anterior al préstamo», el mismo `returnedBeforeLoaned` de `/return`).
- `404` → «Préstamo no encontrado».
- `409` → al dejarlo activo (`returnedAt: null`) el libro ya tiene otro préstamo activo: «El libro ya tiene otro préstamo activo».
- `401`/`403` vía `authErrorResponses`.

Servicio `updateLoan(db, id, data)`: `UPDATE loans SET … WHERE id = $1 RETURNING loanColumns` (Drizzle ignora las claves `undefined`). Resultado `{ status: 'ok', loan } | { status: 'not_found' } | { status: 'returned_before_loaned' } | { status: 'already_loaned' }`: `isCheckViolation` → `returned_before_loaned`, `isUniqueViolation` → `already_loaned`; sin fila devuelta → `not_found` (no hace falta segunda consulta: el `WHERE` solo filtra por id).

### `DELETE /loans/:id`

- Roles: `admin`, `adult`. Params `LoanIdParamsSchema`.
- `204` sin cuerpo; `404` «Préstamo no encontrado»; `400` id no uuid; `401`/`403`.

Servicio `deleteLoan(db, id)`: `DELETE … WHERE id = $1 RETURNING id` → `{ status: 'ok' } | { status: 'not_found' }`.

### Documentación

- `docs/dominio.md`: la regla «Los préstamos no se editan ni se borran (ver `docs/deuda.md`)» pasa a «Los préstamos se pueden corregir (prestatario y fechas, también deshacer una devolución) y borrar; el libro no se cambia».
- `docs/deuda.md`: quitar «No se pueden corregir ni borrar préstamos».

## Archivos

- `packages/schemas/src/loan-detail.ts` — modificar: `UpdateLoanRequestSchema` y su tipo.
- `apps/api/src/modules/loans/service.ts` — modificar: `updateLoan` y `deleteLoan` con sus tipos de resultado.
- `apps/api/src/modules/loans/routes.ts` — modificar: `PATCH` y `DELETE /loans/:id`; actualizar el comentario de cabecera de permisos.
- `apps/api/src/modules/loans/routes.test.ts` — modificar: tests de abajo.
- `docs/dominio.md` — modificar: regla de préstamos.
- `docs/deuda.md` — modificar: quitar la deuda resuelta.

## Subtareas

- [x] **20.1 — todo:** esquema, servicio, rutas, tests y documentación. Tests: los de abajo.

## Tests

Permisos (obligatorios):

- [x] sin token, `PATCH` y `DELETE /loans/:id` → 401
- [x] invitado hace `PATCH /loans/:id` → 403 y el préstamo no cambia
- [x] invitado hace `DELETE /loans/:id` → 403 y el préstamo sigue existiendo
- [x] admin y adulto pueden corregir y borrar (200 / 204)

`PATCH /loans/:id`:

- [x] corrige `borrower` y `loanedAt`; `returnedAt` (no enviado) no cambia
- [x] con `returnedAt` en un préstamo activo, queda devuelto y el detalle del libro tiene `activeLoan: null`
- [x] con `returnedAt: null` en un devuelto, vuelve a estar activo y el detalle del libro lo muestra como `activeLoan`
- [x] (obligatorio por el plan) `returnedAt: null` cuando el libro ya tiene otro préstamo activo → 409 y el préstamo sigue devuelto
- [x] `returnedAt` anterior al `loanedAt` guardado → 400 (regla de la BD); y `loanedAt` posterior al `returnedAt` guardado → 400
- [x] `loanedAt` y `returnedAt` en el cuerpo con la devolución antes → 400 (Zod)
- [x] cuerpo `{}` → 400; cuerpo con `bookId` → 400 y el préstamo no cambia
- [x] préstamo inexistente → 404

`DELETE /loans/:id`:

- [x] borrar un préstamo activo → 204, el libro deja de estar prestado y se puede volver a prestar; el historial del libro ya no lo incluye
- [x] préstamo inexistente → 404

## Conceptos nuevos

- **`PATCH` de corrección vs ruta de acción:** `/return` expresa un hecho del dominio con su regla («solo una vez»); `PATCH` corrige datos sin reglas de flujo. Pueden convivir si las invariantes viven en la BD, que protege todas las vías de escritura a la vez.
- **`204 No Content`:** respuesta de éxito sin cuerpo, la habitual en un `DELETE`.

## Fuera de alcance

- Fecha por defecto con `HOME_TZ` (tarea 21).
- Cambiar el libro de un préstamo (borrar y prestar de nuevo).
- Historial o auditoría de cambios en préstamos.

## Registro de implementación

### 20.1 — todo

- **Archivos:** `packages/schemas/src/loan-detail.ts` (`UpdateLoanRequestSchema`, `UpdateLoanRequest`), `apps/api/src/modules/loans/service.ts` (`updateLoan`, `deleteLoan` y sus tipos de resultado), `apps/api/src/modules/loans/routes.ts` (`PATCH`/`DELETE /loans/:id`, comentario de permisos), `apps/api/src/modules/loans/routes.test.ts` (20 tests nuevos), `docs/dominio.md`, `docs/deuda.md`. Ninguno creado.
- **Desviaciones:** ninguna. Tests añadidos además de los pedidos: `borrower` en blanco y `loanedAt` inválido en `PATCH` → 400; id no uuid en `DELETE` → 400; los 400 por regla de la BD comprueban también que la fila no cambió.
- **Para la revisión:** el `refine` de fechas usa `== null` en ambos lados para no comparar cuando `returnedAt` es `null` (se «desdevuelve») o falta alguna; la comparación de texto `YYYY-MM-DD` equivale a la de fechas. El 409 del `PATCH` tiene mensaje propio («otro préstamo activo»), distinto del de prestar. Los tests se ejecutaron desde el host con el `.env` del checkout principal (el worktree no tiene `.env`).

### Mejoras R1 y R2

- **Archivos:** `apps/api/src/modules/loans/routes.test.ts`. Ninguno creado.
- **R1:** test nuevo «borra un préstamo devuelto»: 204, la fila desaparece y el historial del libro queda vacío.
- **R2:** el caso «devolución antes del préstamo en el cuerpo» sale del `it.each` de 400 a un test propio que exige `code: 'FST_ERR_VALIDATION'`, mensaje que empieza por `body/returnedAt ` y contiene el texto del `refine`. Si el `refine` desapareciera, la BD daría 400 con el `returnedBeforeLoaned` de la ruta y el test fallaría.
- **Desviaciones:** ninguna. Tests de nuevo desde el host con el `TEST_DATABASE_URL` del `.env` del checkout principal.

## Revisión

Resultado: lista para terminar (segunda vuelta: R1 y R2 aplicadas y comprobadas; typecheck, lint, formato y 376 tests en verde; sin mejoras nuevas)

Segunda vuelta: el test de R2 falla si se anula el segundo `refine` del esquema (comprobado con una mutación temporal, ya revertida), así que protege la regla de Zod y no solo la de la BD.

- [x] **R1 · recomendable · `apps/api/src/modules/loans/routes.test.ts` (`DELETE /loans/:id`)** (aceptada) — solo se prueba borrar un préstamo activo; la decisión dice «esté activo o devuelto» → añadir un caso que borre un préstamo devuelto (204 y desaparece del historial del libro). Si alguien añadiera `returned_at IS NULL` al `WHERE`, ningún test fallaría.
- [x] **R2 · opcional · `apps/api/src/modules/loans/routes.test.ts` (`'%s da 400'`, caso «devolución antes del préstamo en el cuerpo»)** (aceptada) — sobre un préstamo activo, sin el `refine` de Zod el `UPDATE` saltaría igual con `loans_returned_after_loaned` y daría el mismo 400: el test no distingue si el error viene de Zod → en ese caso, comprobar que la respuesta es un error de validación (el mensaje de Fastify con `body/returnedAt`, no el `returnedBeforeLoaned` de la ruta). Así el test protege la regla del esquema y no solo la de la BD.

## Cierre

- **Documentado:** `docs/dominio.md` (los préstamos se corrigen y se borran; el libro no cambia); `apps/api/CLAUDE.md` (patrón «Acciones con reglas»: convive con un `PATCH` de corrección si las invariantes viven en la BD, ver `updateLoan`); Notas de `docs/fases/fase-1-plan.md` (contrato de `PATCH`/`DELETE /loans/:id` para la web).
- **Deuda:** resuelta y borrada de `docs/deuda.md` «No se pueden corregir ni borrar préstamos» (tarea 13). Sin deuda nueva: cambiar el libro de un préstamo (borrar y prestar de nuevo) y no auditar cambios son decisiones, no pendientes.
- **Pendiente para otras tareas:** la fecha por defecto con `HOME_TZ` (tarea 21) afecta también a `PATCH /loans/:id` solo si se decide rellenar fechas al corregir (propuesta: no; ahí las fechas siempre llegan explícitas).

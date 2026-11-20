# Tarea 14 — Lecturas

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

Que cada miembro registre, edite y borre **sus** lecturas de un libro (inicio, fin, valoración y nota) y que toda la casa, invitado incluido, pueda consultar quién ha leído qué. Lo usarán el detalle de libro de la web (tarea 19) y, más adelante, el asistente.

## Decisiones

- **El invitado ve las lecturas de la casa, pero no crea, edita ni borra** — cambio sobre el plan, que decía «invitado → 403 (ni ve ni crea)». Se actualizan `docs/dominio.md` y la tarea 14 del plan al confirmar esta especificación.
- **Un solo listado `GET /readings?bookId=&userId=` con filtros combinables y paginado** — `/users/:id/readings` colgaría del módulo de usuarios, que es solo para el admin, y mezclaría permisos. Con los dos filtros, el asistente podrá preguntar «¿ha leído Ana este libro?». «Mis lecturas» = `?userId=<id de /auth/me>`.
- **Cada elemento del listado lleva `user: { id, name }` y `book: { id, title }`** — el detalle de libro necesita quién lo leyó y la lista de un usuario necesita el título. El `BookDetail` completo se repetiría sin necesidad.
- **Aquí sí vale un `JOIN`** con `users` y `books`: cada lectura tiene exactamente un usuario y un libro, así que no se repiten filas ni se infla `total` (al revés que los filtros N:M de `listBooks`).
- **La lectura es siempre del usuario de la sesión** — `userId` no va en el cuerpo. El libro y el usuario de una lectura no se pueden cambiar.
- **Autorización por fila con `UPDATE/DELETE … WHERE id = $1 AND user_id = <yo> RETURNING`** — mismo patrón que `returnLoan`: atómico y sin leer antes. Si no cambia ninguna fila, una segunda consulta distingue 404 (no existe) de 403 (es de otro). El admin tampoco puede tocar lecturas ajenas.
- **`PATCH` parcial con `null` para vaciar** — `rating: null` quita la valoración; un campo ausente no se toca; un cuerpo vacío → 400 (como `UpdateUserRequestSchema`).
- **Fechas:** en el alta, Zod comprueba que haya al menos una fecha y que el fin no sea anterior al inicio. En la edición, el resultado depende de lo guardado, así que lo detectan los `check` de la BD (`isCheckViolation` + `constraintOf`) → 400 con un mensaje por regla.
- **Relecturas sin restricción:** varias lecturas del mismo libro por persona, incluso dos «leyendo» a la vez — el dominio no lo prohíbe.
- **Orden:** primero las que están «leyendo» (sin fin), luego `finishedAt desc`; desempate `startedAt desc nulls last`, `createdAt desc`, `id`.

## Especificación

### Esquemas (`packages/schemas/src/reading.ts`, ampliar)

No hay riesgo de import circular: no usa `book-detail.ts`.

- `ReadingIdParamsSchema = z.object({ id: z.uuid() })` + tipo.
- `CreateReadingRequestSchema`: `startedAt: DateSchema.optional()`, `finishedAt: DateSchema.optional()`, `rating: RatingSchema.optional()`, `note: ReadingNoteSchema.optional()`, con `refine` para «al menos una fecha» y para «fin ≥ inicio» si vienen las dos (comparar los textos `YYYY-MM-DD` vale) + tipo.
- `UpdateReadingRequestSchema`: los mismos cuatro campos `.nullable().optional()`, con `refine` para «al menos un campo» (como `UpdateUserRequestSchema`) y para «fin ≥ inicio» si vienen las dos no nulas + tipo.
- `ReadingListQuerySchema = PaginationQuerySchema.extend({ bookId: z.uuid().optional(), userId: z.uuid().optional() })` + tipo.
- `ReadingListItemSchema = ReadingSchema.extend({ user: z.object({ id: z.uuid(), name: z.string() }), book: z.object({ id: z.uuid(), title: z.string() }) })` + tipo.
- `ReadingListResponseSchema = z.object({ readings: z.array(ReadingListItemSchema), total: z.number() })` + tipo.

(`reading.ts` ya se reexporta desde `index.ts`.)

### Rutas (`tags: ['readings']`, `security: sessionSecurity`, `app.authenticate` como hook del plugin)

| Método y ruta | Roles | Cuerpo / query | Respuestas |
|---|---|---|---|
| `GET /readings` | cualquiera con sesión | `ReadingListQuery` | 200 `ReadingListResponse` · 400 validación · 401 |
| `POST /books/:id/readings` | admin, adult | `CreateReadingRequest` | 201 `Reading` · 400 validación · 401 · 403 · 404 «Libro no encontrado» |
| `PATCH /readings/:id` | admin, adult (solo el dueño) | `UpdateReadingRequest` | 200 `Reading` · 400 validación o regla de fechas · 401 · 403 · 404 «Lectura no encontrada» |
| `DELETE /readings/:id` | admin, adult (solo el dueño) | — | 204 sin cuerpo · 400 id no uuid · 401 · 403 · 404 «Lectura no encontrada» |

- 403 de lectura ajena: «No puedes modificar lecturas de otro». El invitado recibe antes el 403 de `requireRole`.
- 400 de los `check` en la edición: `readings_has_date` → «Indica al menos la fecha de inicio o la de fin»; `readings_finished_after_started` → «El fin no puede ser anterior al inicio».
- Listado: sin filtros, todas las de la casa; filtros combinados con AND; un id inexistente da lista vacía; `total` con el mismo `where` sin `limit`/`offset`. Incluye las lecturas de usuarios desactivados.

### Servicio (`modules/readings/service.ts`)

Funciones `fn(db: DbOrTx, …)` con resultado explícito, como en `authors/`:

- `createReading(db, bookId, userId, data)` → `ok` (con la `Reading`) | `book_not_found` (`isForeignKeyViolation`).
- `updateReading(db, id, userId, data)` → `ok` | `not_found` | `forbidden` | `no_date` | `finished_before_started` (los dos últimos según `constraintOf`).
- `deleteReading(db, id, userId)` → `ok` | `not_found` | `forbidden`.
- `listReadings(db, query)` → `{ readings, total }`.

## Archivos

- `packages/schemas/src/reading.ts` — modificar: DTOs de arriba.
- `apps/api/src/modules/readings/service.ts` — crear.
- `apps/api/src/modules/readings/routes.ts` — crear.
- `apps/api/src/modules/readings/routes.test.ts` — crear.
- `apps/api/src/app.ts` — modificar: registrar `readingRoutes`.
- `apps/api/src/test/helpers.ts` — modificar: `createReading({ bookId, userId, startedAt?, finishedAt?, rating?, note? })` con valores por defecto válidos.
- `apps/api/CLAUDE.md` — modificar: añadir `readings` a la lista de módulos y una línea sobre «autorización por fila con `WHERE user_id` + segunda consulta 404/403».

## Subtareas

- [x] **14.1 — todo:** esquemas, servicio, rutas, helper, tests y documentación. Tests: los de abajo.

## Tests

Obligatorios (permisos):
- [x] sin sesión, las cuatro rutas → 401
- [x] invitado hace `GET /readings` → 200 y ve las lecturas de otros
- [x] invitado hace `POST /books/:id/readings`, `PATCH` y `DELETE /readings/:id` → 403 (y nada cambia)
- [x] adulto y admin crean su lectura → 201 con su `userId`
- [x] adulto edita o borra una lectura de otro → 403 (y nada cambia)
- [x] admin edita o borra una lectura de otro → 403 (y nada cambia)
- [x] el dueño edita → 200 y borra → 204

Crear:
- [x] solo con `startedAt` (leyendo) → 201 con `finishedAt: null`, `rating: null` y `note: null`
- [x] sin ninguna fecha, `finishedAt` anterior a `startedAt`, `rating` 0, 6 o 3.5, `note` vacía → 400
- [x] libro inexistente → 404
- [x] dos lecturas del mismo libro por la misma persona → las dos 201

Editar y borrar:
- [x] `PATCH` solo con `rating` cambia la valoración y deja el resto igual
- [x] `rating: null` y `note: null` los vacían
- [x] `PATCH` con cuerpo vacío → 400
- [x] `startedAt: null` en una lectura sin `finishedAt` → 400 (`check`)
- [x] `finishedAt` anterior al `startedAt` guardado → 400 (`check`)
- [x] lectura inexistente → 404 en `PATCH` y `DELETE`
- [x] borrar el libro borra sus lecturas (cascada)

Listado:
- [x] `bookId` devuelve solo las de ese libro, cada una con `user.name` y `book.title`
- [x] `userId` devuelve solo las de ese usuario; `bookId` + `userId` combinados
- [x] orden: «leyendo» primero, luego por `finishedAt` descendente
- [x] `limit`/`offset` paginan y `total` cuenta todas las que cumplen el filtro
- [x] `bookId` no uuid → 400; id inexistente → lista vacía

## Conceptos nuevos

- **Autorización por fila:** además de «¿qué rol tienes?» (`requireRole`), «¿esta fila es tuya?». Se resuelve en el propio `WHERE` de la escritura (`user_id = <yo>`), de forma que una lectura ajena nunca se modifica, ni siquiera por error de código o carrera entre peticiones.
- **404 frente a 403:** cuando la escritura no afecta a ninguna fila, una segunda consulta dice si la fila no existe (404) o es de otro (403). Aquí revelar que existe no es un problema porque toda la casa puede ver las lecturas; si no, se respondería 404 en ambos casos.
- **`PATCH` con `null` frente a ausente:** «no envío el campo» = no tocarlo; «envío `null`» = vaciarlo. Zod lo expresa con `.nullable().optional()`.

## Fuera de alcance

- Pantallas de lecturas en la web — tarea 19.
- Estadísticas («cuántos libros he leído este año») — fases futuras o el asistente.

## Registro de implementación

### 14.1 — todo

- **Archivos:** `packages/schemas/src/reading.ts` (DTOs), `apps/api/src/modules/readings/{service,routes,routes.test}.ts` (creados), `apps/api/src/app.ts`, `apps/api/src/test/helpers.ts` (`createReading`), `apps/api/src/http-errors.ts`, `apps/api/CLAUDE.md`.
- **Desviaciones:**
  - `forbidden(msg)` nuevo en `http-errors.ts` (no estaba en «Archivos»): el 403 «No puedes modificar lecturas de otro» necesita el mismo cuerpo que `notFound`/`conflict`.
  - Test extra: `id` no uuid → 400 en `PATCH` y `DELETE` (está en la tabla de rutas, no en la lista de tests).
  - Los `refine` de «fin ≥ inicio» llevan `path: ['finishedAt']` (como el de `sagaOrder` en libros).
- **A mirar en la revisión:**
  - `updateReading` pasa el cuerpo validado tal cual a `.set(data)`: Zod elimina claves desconocidas, `undefined` no se toca y `null` vacía. El cuerpo vacío no llega (lo para el `refine`).
  - Solo se traducen `readings_has_date` y `readings_finished_after_started` (mapa `dateRuleConstraints`); otro `check` (p. ej. `readings_rating_range`, que Zod ya impide) se relanza → 500.
  - Orden con `finished_at desc nulls first` explícito (en Postgres `desc` ya pone los `NULL` primero, pero así se lee la intención).
  - Las respuestas `403`/`404` comparten `missingOrForbidden` en `service.ts` (una única segunda consulta para `PATCH` y `DELETE`).

### Mejoras R1 y R2

- **R1:** `readingDateMessages` se exporta desde `packages/schemas/src/reading.ts` y `apps/api/src/modules/readings/routes.ts` construye `noDate`/`finishedBeforeStarted` con él.
- **R2:** test «incluye las lecturas de usuarios desactivados» en `apps/api/src/modules/readings/routes.test.ts` (`createUser({ active: false })`).
- Sin desviaciones.

## Revisión

Resultado: lista para terminar (segunda vuelta: R1 y R2 aplicadas y correctas, sin mejoras nuevas; typecheck, lint, formato y 325 tests en verde).

- [x] **R1 · recomendable · `apps/api/src/modules/readings/routes.ts:20-21`** (aceptada) — los mensajes «Indica al menos la fecha…» y «El fin no puede ser anterior…» están escritos dos veces: en `readingDateMessages` de `packages/schemas/src/reading.ts` (Zod) y en las constantes de la ruta (`check` de la BD) → exportar `readingDateMessages` desde `@jarvis/schemas` y construir `noDate`/`finishedBeforeStarted` con él. Si uno se retoca, el alta y la edición dirían cosas distintas para la misma regla.
- [x] **R2 · recomendable · `apps/api/src/modules/readings/routes.test.ts`** (aceptada) — la especificación dice «Incluye las lecturas de usuarios desactivados» y ningún test lo comprueba → añadir uno con `createUser({ active: false })` cuya lectura aparezca en `GET /readings`. Un filtro `active = true` añadido en el `JOIN` por inercia (como en otros listados de usuarios) borraría historia de la casa sin que falle nada.

## Cierre

- **Documentado:** `apps/api/CLAUDE.md` (módulo `readings`, `forbidden(msg)` y patrón «Autorización por fila»), `docs/dominio.md` (el invitado ve las lecturas de la casa), tarea 14 de `fase-1-plan.md` (tests de invitado) y una línea en sus «Notas» con los contratos que usará la tarea 19.
- **Deuda:** la entrada «Sin fecha por defecto» de `docs/deuda.md` cubre ahora también las lecturas (la API no calcula «hoy»).
- **Pendiente para otras tareas:** pantallas de lecturas en el detalle de libro (tarea 19); estadísticas de lectura (fases futuras o el asistente).

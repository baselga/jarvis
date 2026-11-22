# Tarea 21 — Fecha por defecto con `HOME_TZ`

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

Si un cliente no envía la fecha al prestar, devolver o empezar una lectura, la API usa «hoy» en la zona horaria de casa (`HOME_TZ`), no la del servidor. Sirve para que el asistente pueda «préstalo hoy» o «empiezo a leerlo» sin calcular fechas, y resuelve la entrada de `docs/deuda.md` sobre fechas por defecto.

## Decisiones

- **«Hoy» se calcula en JS, no en SQL** — una función pura `todayIn(timeZone, now = new Date())` se prueba con un instante fijo; la hora de Postgres no se puede fijar en un test. Mismo patrón que `createSession(db, userId, now)`.
- **La zona entra por `BuildAppOptions.homeTimeZone`** y las rutas usan el decorador `app.today()` — patrón «dependencias inyectadas en `buildApp()`»: los tests eligen la zona sin tocar el entorno.
- **`HOME_TZ` con valor por defecto `Europe/Madrid` y validada al arrancar** — una zona mal escrita (`Europa/Madrid`) haría fallar cada petición sin fecha; mejor que la API no arranque (*fail fast*).
- **Variable propia `HOME_TZ`, no `TZ`** — `TZ` cambia la zona de todo el proceso (logs, `Date` local) de forma implícita; `HOME_TZ` solo afecta a «qué día es en casa».
- **Lectura sin fechas → `startedAt = hoy`** («empiezo a leerlo», queda *leyendo*) — al terminar un libro lo normal es editar la lectura existente con `PATCH`.
- **Solo los `POST` rellenan** — en los `PATCH`, un campo ausente significa «no tocar»; rellenarlo cambiaría datos sin pedirlo.
- **Cuerpo vacío permitido** en `POST /loans/:id/return` y `POST /books/:id/readings` — «devuélvelo» y «empiezo a leerlo» no necesitan datos.

## Especificación

### Configuración

- `EnvSchema` (`apps/api/src/config.ts`): `HOME_TZ: z.string().default('Europe/Madrid')` con un `refine` que la valida con `Intl` (p. ej. `Intl.supportedValuesOf('timeZone')` o un `new Intl.DateTimeFormat('en', { timeZone })` que no lance `RangeError`). Inválida → `loadConfig` lanza un error que menciona `HOME_TZ`.
- `.env.example`: sección `# API` con `HOME_TZ=Europe/Madrid` y un comentario (zona IANA de casa; decide qué día es «hoy»).
- `docker-compose.yml`, servicio `api`: `HOME_TZ: ${HOME_TZ:-Europe/Madrid}`.
- `server.ts` pasa `homeTimeZone: config.HOME_TZ` a `buildApp`.

### Fecha de hoy

- `apps/api/src/dates.ts` — `todayIn(timeZone: string, now = new Date()): DateString`: el día de `now` en `timeZone` como `YYYY-MM-DD` (con ceros a la izquierda). Con `Intl.DateTimeFormat` (`formatToParts` o el locale `en-CA`, que ya formatea `YYYY-MM-DD`).
- `BuildAppOptions.homeTimeZone?: string`, por defecto `'Europe/Madrid'` (constante compartida con `config.ts`, p. ej. `DEFAULT_HOME_TZ`, para no repetir el literal).
- Decorador `app.today(): DateString` = `todayIn(homeTimeZone)`, declarado en el `declare module 'fastify'` de `app.ts`.

### Esquemas (`packages/schemas`)

- `CreateLoanRequestSchema`: `loanedAt: DateSchema.optional()`. Actualizar el comentario («las fechas son obligatorias…»): ausente = hoy en casa.
- `ReturnLoanRequestSchema`: `returnedAt: DateSchema.optional()` y el cuerpo entero opcional (sin cuerpo = `{}`).
- `CreateReadingRequestSchema`: se quita el `refine` de «al menos una fecha» (lo cubre el valor por defecto; `readingDateMessages.noDate` se queda, lo usa la edición). Se mantiene `finishedAfterStarted`. Cuerpo entero opcional.
- `UpdateLoanRequestSchema` y `UpdateReadingRequestSchema`: sin cambios.

Para el cuerpo opcional, comprobar que `fastify-type-provider-zod` acepta `.optional()` en `body` (el parser de `buildApp` convierte un cuerpo vacío en `undefined`); si no, `.default({})`. Sin cabecera `Content-Type` y sin cuerpo también debe funcionar.

**Acordado al implementar (21.2):** ni `.optional()` ni `.default({})` sirven, porque Fastify valida un cuerpo ausente como `null` (`lib/validation.js`, haya o no `Content-Type`). El cuerpo opcional se declara con `.nullish()` en `ReturnLoanRequestSchema` y `CreateReadingRequestSchema`; las rutas hacen `body ?? {}`.

### Rutas

- `POST /books/:id/loans`: `loanedAt: body.loanedAt ?? app.today()`. El resto igual (409 si ya está prestado, etc.).
- `POST /loans/:id/return`: `returnedAt: body?.returnedAt ?? app.today()`. Si el préstamo tiene `loanedAt` futuro, el `check` de la BD sigue dando 400 (comportamiento actual).
- `POST /books/:id/readings`: si no llega ni `startedAt` ni `finishedAt`, `startedAt = app.today()`; si llega alguna, nada se rellena. `rating`/`note` sin fechas → también `startedAt = hoy`.
- El valor por defecto se aplica en la ruta (capa HTTP), no en el servicio: los servicios siguen recibiendo fechas ya resueltas.
- `summary`/`description` de OpenAPI mencionan el valor por defecto.

### Documentación

- `apps/api/CLAUDE.md`: `src/dates.ts` en la estructura y un patrón «Fecha de hoy»: nunca `CURRENT_DATE` ni `new Date().toISOString().slice(0, 10)` (UTC); usar `app.today()` / `todayIn`.
- `docs/deuda.md`: quitar la entrada «Sin fecha por defecto en préstamos ni lecturas».

## Archivos

- `apps/api/src/config.ts` — modificar: `HOME_TZ` validada, `DEFAULT_HOME_TZ`.
- `apps/api/src/config.test.ts` — modificar: casos de `HOME_TZ`.
- `apps/api/src/dates.ts` — crear: `todayIn`.
- `apps/api/src/dates.test.ts` — crear: casos de `todayIn`.
- `apps/api/src/app.ts` — modificar: `homeTimeZone` y decorador `today`.
- `apps/api/src/server.ts` — modificar: pasar `homeTimeZone`.
- `.env.example`, `docker-compose.yml` — modificar: `HOME_TZ`.
- `packages/schemas/src/loan-detail.ts` — modificar: fechas opcionales en crear y devolver.
- `packages/schemas/src/reading.ts` — modificar: crear lectura sin fechas.
- `apps/api/src/modules/loans/routes.ts` (+ `routes.test.ts`) — modificar: valor por defecto y tests.
- `apps/api/src/modules/readings/routes.ts` (+ `routes.test.ts`) — modificar: valor por defecto y tests.
- `apps/api/CLAUDE.md`, `docs/deuda.md` — modificar: documentación.

## Subtareas

- [x] **21.1 — `HOME_TZ` y `todayIn`:** config, `.env.example`, Compose, `dates.ts`, `homeTimeZone` + `app.today()` en `buildApp`, `server.ts`. Aún no lo usa ninguna ruta. Tests: `config.test.ts` y `dates.test.ts`.
- [x] **21.2 — Fechas por defecto en préstamos y lecturas:** esquemas, las tres rutas, `CLAUDE.md` de la API y `deuda.md`. Tests: los de rutas de abajo.

## Tests

Ninguno es obligatorio por `CLAUDE.md` (no tocan auth ni permisos); el plan pide probar el comportamiento nuevo.

Para que no dependan de la hora a la que se ejecutan, los tests de rutas fijan el reloj con `vi.setSystemTime(new Date('2026-03-01T23:30:00Z'))` (sin *fake timers* solo simula `Date`) y lo restauran en `afterEach` con `vi.useRealTimers()`. Ese instante es 2 de marzo en Madrid y 1 de marzo en UTC. Ojo: las sesiones calculan su caducidad con `Date`, así que el reloj se fija antes de `createSession`.

`todayIn` / config (21.1):
- [x] `todayIn('Europe/Madrid', 2026-03-01T23:30Z)` → `2026-03-02`; `todayIn('UTC', mismo instante)` → `2026-03-01`.
- [x] Zona al oeste: `todayIn('Pacific/Pago_Pago', 2026-03-01T05:00Z)` → `2026-02-28`.
- [x] Mes y día de una cifra salen con cero: `todayIn('UTC', 2026-01-05T12:00Z)` → `2026-01-05`.
- [x] `loadConfig` sin `HOME_TZ` → `Europe/Madrid`; con `America/New_York` → la respeta; con `Europa/Madrid` → lanza error que menciona `HOME_TZ`.

Rutas (21.2), con reloj fijo y la zona por defecto (Madrid):
- [x] `POST /books/:id/loans` sin `loanedAt` → 201 con `loanedAt: '2026-03-02'` (no `2026-03-01`).
- [x] `POST /books/:id/loans` con `loanedAt` → se respeta.
- [x] `POST /loans/:id/return` sin cuerpo → 200 con `returnedAt: '2026-03-02'`; con `{}` → igual; con `returnedAt` → se respeta.
- [x] `buildTestApp({ homeTimeZone: 'UTC' })` + préstamo sin fecha → `2026-03-01` (la zona viene de la opción).
- [x] `POST /books/:id/readings` sin cuerpo → 201 con `startedAt: '2026-03-02'` y `finishedAt: null`.
- [x] `POST /books/:id/readings` con solo `rating` → `startedAt: '2026-03-02'`.
- [x] `POST /books/:id/readings` con solo `finishedAt` → `startedAt: null`, `finishedAt` el enviado.
- [x] Tests existentes que esperaban 400 por falta de fecha y ahora son válidos: quitar `{}` y `{ rating: 4 }` de «rechaza cuerpos inválidos con 400» (`readings/routes.test.ts`), y los casos `'sin loanedAt'` y `'sin returnedAt'` de los `it.each` de `loans/routes.test.ts` (cubiertos por los de arriba). Los de `PATCH` («cuerpo vacío → 400», «quitar el inicio… → 400») siguen igual.

## Conceptos nuevos

- **Zona horaria de negocio vs. del servidor:** un «día» depende de dónde estés; el contenedor suele ir en UTC, así que «hoy» se calcula explícitamente en la zona de casa con `Intl.DateTimeFormat({ timeZone })`.
- **Reloj inyectable:** las funciones que dependen de la hora reciben `now` (por defecto `new Date()`), y los tests fijan el instante con `vi.setSystemTime` para ser deterministas.
- **Cuerpo ausente en Fastify:** si la ruta declara `body`, un POST sin cuerpo se valida como `null` (no `undefined`), así que un cuerpo opcional se declara `.nullish()` y la ruta hace `body ?? {}`.

## Fuera de alcance

- Que el asistente sepa la fecha de hoy para fechas relativas («ayer», «el lunes»): fase 3.
- Valores por defecto en los `PATCH` (p. ej. «terminé de leerlo hoy» = `PATCH` con `finishedAt` explícito).
- Datos de ejemplo: tarea 22.

## Registro de implementación

### 21.1 — `HOME_TZ` y `todayIn`

- Archivos: `apps/api/src/dates.ts` y `dates.test.ts` (creados); `config.ts`, `config.test.ts`, `app.ts`, `server.ts`, `.env.example`, `docker-compose.yml`.
- `dates.ts` exporta además `DEFAULT_HOME_TZ` e `isValidTimeZone` (el `refine` de `config.ts` la usa): así la constante y la validación de zona viven junto a `todayIn` y `config.ts` no repite la lógica de `Intl`.
- `todayIn` usa `formatToParts` (no el locale `en-CA`): no depende de cómo formatee ese locale cada versión de ICU.
- En `EnvSchema` el orden es `.default(...).refine(...)`: el `refine` valida también el valor por defecto.
- Ninguna ruta usa aún `app.today()` (llega en 21.2).

### 21.2 — Fechas por defecto en préstamos y lecturas

- Archivos: `packages/schemas/src/loan-detail.ts` y `reading.ts`; `apps/api/src/modules/loans/routes.ts`, `service.ts` y `routes.test.ts`; `apps/api/src/modules/readings/routes.ts`, `service.ts` y `routes.test.ts`; `apps/api/CLAUDE.md`; `docs/deuda.md`.
- **Desviación acordada:** cuerpo opcional con `.nullish()`, no `.optional()` (ver la nota en «Esquemas»). Se probó primero un hook `preValidation` que pasaba `null` → `undefined`: no sirve, Fastify vuelve a convertir `undefined` en `null` al validar. Efecto lateral: un cuerpo JSON literal `null` cuenta como «sin cuerpo» (→ hoy). El patrón queda en `apps/api/CLAUDE.md` («Cuerpo vacío»).
- Servicios (no estaban en «Archivos»): solo tipos, para que reciban fechas resueltas. `createLoan` recibe `Required<CreateLoanRequest>` (`loanedAt` ya no es opcional) y `createReading` `NonNullable<CreateReadingRequest>`.
- El valor por defecto va en `description` de OpenAPI (el `summary` queda corto).
- En lecturas, la ruta solo rellena `startedAt` si no llega ninguna de las dos fechas; si llega `finishedAt`, se pasa tal cual.
- Tests: bloques nuevos «fecha por defecto» en ambos `routes.test.ts`, con el reloj fijado en `beforeEach` (antes de `createSession`). El de `homeTimeZone: 'UTC'` crea y cierra su propia app. Quitados los casos `{}`/`{ rating: 4 }` y `'sin loanedAt'`/`'sin returnedAt'` que esperaban 400.

## Revisión

Resultado: lista para terminar

Especificación y tests cumplidos; typecheck, lint, Prettier y tests (389) en verde. Comprobado además que `vi.useRealTimers()` restaura `Date` (los tests posteriores con sesión pasan) y que `/docs/json` se genera con los cuerpos `.nullish()`.

- [x] **R1 · opcional · `apps/api/src/openapi.ts:30`** (aceptada: apuntada en `docs/deuda.md`, sin tocar código) — En `/docs/json`, `POST /loans/{id}/return` y `POST /books/{id}/readings` salen con `requestBody.required: true` (+ `nullable: true`): `@fastify/swagger` lo fija siempre que hay `schema.body`, y contradice la `description` («o sin cuerpo»). → Un `transformObject` en `registerOpenApi` que ponga `required: false` cuando el esquema del cuerpo es `nullable`, o apuntarlo en `docs/deuda.md` hasta que un cliente se genere desde el OpenAPI. Solo afecta a la documentación; el cliente tipado de la fase 2 usa `@jarvis/schemas`.

## Cierre

- Documentado: patrones «Fecha de hoy», «Cuerpo vacío» (`.nullish()`) y `homeTimeZone` en «Dependencias inyectadas», y `src/dates.ts` en la estructura (`apps/api/CLAUDE.md`); `HOME_TZ` en `.env.example` y `docker-compose.yml`; fechas por defecto en préstamo y lectura (`docs/dominio.md`); nota de la tarea 21 y nota de la tarea 13 corregida (`fase-1-plan.md`).
- Deuda: resuelta y borrada «Sin fecha por defecto en préstamos ni lecturas»; nueva «OpenAPI con cuerpo opcional marcado como obligatorio» (R1) en `docs/deuda.md`.
- Pendiente para otras tareas: el asistente (fase 3) puede omitir la fecha en «préstalo/devuélvelo/empiezo a leerlo hoy»; las fechas relativas («ayer», «el lunes») siguen fuera de alcance.

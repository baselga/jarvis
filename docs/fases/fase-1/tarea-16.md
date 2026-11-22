# Tarea 16 — 503 si cae la BD

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

Un manejador de errores global (`setErrorHandler`) traduce los fallos de conexión con la BD a 503 en cualquier ruta, también en las protegidas, donde hoy `authenticate` revienta con 500. De paso, los demás 500 dejan de enseñar el mensaje interno, que con Drizzle incluye el SQL y sus parámetros. El 503 queda documentado en OpenAPI en todas las rutas.

## Decisiones

- **Lista explícita de errores de «BD no disponible»** (`isDbUnavailable` en `db/errors.ts`) — un bug de SQL sigue siendo 500 y no se confunde con una caída.
- **Mensaje genérico en los 500** — el detalle va solo al log; hoy el cliente ve `Failed query: <SQL> params: <…>`.
- **Los 4xx se delegan en el manejador por defecto de Fastify** — validación (400) y demás conservan su forma y mensajes actuales.
- **503 en OpenAPI con un `transform`** en `openapi.ts` que lo añade a toda ruta que no lo declare — ninguna ruta nueva se olvida y `/health` conserva el suyo.
- **El test usa una conexión real a un puerto cerrado** (`127.0.0.1:1`), no un mock — el error es el que lanza de verdad `postgres` (envuelto por Drizzle) y falla al instante.
- **`/health` no cambia** — ya responde su propio 503 con `HealthResponseSchema`.

## Especificación

### `isDbUnavailable(error)` en `src/db/errors.ts`

`true` si el código del error o de su `cause` (como `hasCode`) es uno de:

- Red (Node): `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `EAI_AGAIN`, `EHOSTUNREACH`.
- `postgres` (cliente): `CONNECT_TIMEOUT`, `CONNECTION_CLOSED`, `CONNECTION_ENDED`, `CONNECTION_DESTROYED`.
- SQLSTATE de Postgres: cualquiera que empiece por `08` (clase *connection exception*), `57P01`, `57P02`, `57P03` (servidor apagándose o arrancando) y `53300` (demasiadas conexiones).

Si al probar con la conexión real el código llega dentro de un `AggregateError` (Node, varias direcciones para un host), mirar también sus `errors`; si no hace falta, no añadirlo.

### `serviceUnavailable(message)` en `src/http-errors.ts`

`{ statusCode: 503, error: 'Service Unavailable', message } as const`, como los demás.

### Manejador global en `src/error-handler.ts`

`errorHandler(error, request, reply)`, registrado con `app.setErrorHandler(errorHandler)` en `buildApp`, **antes** de registrar plugins y rutas para que lo hereden todos.

1. `isDbUnavailable(error)` → `request.log.error({ err: error }, 'La BD no responde')` y `503` con `serviceUnavailable('La base de datos no está disponible')`.
2. Error con `statusCode` entre 400 y 499 → se delega en el manejador por defecto de Fastify (en Fastify 5, relanzarlo desde el manejador lo pasa al padre; verificarlo). La respuesta no cambia respecto a hoy.
3. Resto (sin `statusCode` o 5xx) → `request.log.error({ err: error }, …)` y `500` con `{ statusCode: 500, error: 'Internal Server Error', message: 'Error interno' }`.

### OpenAPI en `src/openapi.ts`

`transform` que envuelve `jsonSchemaTransform`: si la ruta tiene `schema`, antes de convertir añade `503: ErrorResponseSchema` a `schema.response` salvo que la ruta ya declare un `503` (el de la ruta gana). Solo afecta a la documentación; la serialización real no cambia.

### Documentación

- `apps/api/CLAUDE.md`: `src/error-handler.ts` en la estructura; `isDbUnavailable` en la línea de `db/errors.ts`; `serviceUnavailable` en la de `http-errors.ts`; en «Códigos HTTP con intención», que el 503 y el 500 genérico los pone el manejador global (las rutas no capturan errores de BD ni declaran el 503).
- `docs/deuda.md`: borrar la entrada «Si la BD cae, las rutas protegidas dan 500, no 503».

## Archivos

- `apps/api/src/db/errors.ts` — modificar: `isDbUnavailable`.
- `apps/api/src/db/errors.test.ts` — modificar: casos de `isDbUnavailable`.
- `apps/api/src/http-errors.ts` — modificar: `serviceUnavailable`.
- `apps/api/src/error-handler.ts` — crear: manejador global.
- `apps/api/src/error-handler.test.ts` — crear: 503, 500 genérico y 400 intacto.
- `apps/api/src/app.ts` — modificar: `app.setErrorHandler(errorHandler)`.
- `apps/api/src/openapi.ts` — modificar: `transform` que añade el 503.
- `apps/api/src/openapi.test.ts` — modificar: el 503 aparece en una ruta protegida y `/health` mantiene el suyo.
- `apps/api/CLAUDE.md`, `docs/deuda.md` — modificar: ver «Documentación».

## Subtareas

- [x] **16.1 — todo:** helper, manejador, OpenAPI y documentación. Tests: los de abajo.

## Tests

En `error-handler.test.ts`, la app con la BD caída es `buildApp({ db })` con `createDb('postgres://jarvis:x@127.0.0.1:1/jarvis')`, cerrando la conexión al terminar.

- [x] BD inaccesible en una ruta protegida (`GET /auth/me` con `Authorization: Bearer x`) → 503 con `{ statusCode: 503, error: 'Service Unavailable', message: 'La base de datos no está disponible' }`.
- [x] BD inaccesible en una ruta pública (`POST /auth/login` con cuerpo válido) → 503.
- [x] Una ruta que lanza `new Error('detalle interno')` (añadida en el test sobre `buildTestApp()` antes de `ready`) → 500 con `message: 'Error interno'`; el cuerpo no contiene «detalle interno».
- [x] Un cuerpo inválido (`POST /auth/login` con `{}`) → 400 con el mensaje de validación de siempre (sigue delegando).
- [x] `isDbUnavailable`: `true` con `ECONNREFUSED`, `CONNECTION_ENDED`, `08006` y `57P01`, directos y en `cause`; `false` con `23505`, un `Error` sin código y `undefined`.
- [x] `/docs/json`: `GET /authors` lista el `503`; el `503` de `/health` sigue siendo el de `HealthResponseSchema` (tiene la propiedad `db`).
- [x] El resto de la suite sigue en verde (los 4xx no cambian).

## Conceptos nuevos

- **Manejador de errores global (`setErrorHandler`):** todo error que se lanza en hooks o handlers acaba en él; se hereda por encapsulación, así que se registra antes que los plugins. Relanzar desde él lo pasa al manejador padre (aquí el de Fastify).
- **No filtrar detalles internos en los 500:** el cliente recibe un mensaje genérico y el detalle va al log; los mensajes de error del ORM llevan SQL y parámetros.
- **Errores de conexión vs. errores de consulta:** los primeros vienen de la red (códigos de Node como `ECONNREFUSED`), del cliente (`postgres`) o de Postgres con SQLSTATE de clase `08`/`57P0x`; los segundos (`23xxx`, sintaxis…) son de la petición o del código. Solo los primeros son un 503.

## Fuera de alcance

- Cabecera `Retry-After` en el 503: sin cliente que la use todavía.
- Qué pasa si la BD no está al arrancar la API (`server.ts`, migraciones): se verá al desplegar, en la fase 4.
- Reintentos automáticos de consultas fallidas.

## Registro de implementación

### 16.1 — todo

- **Archivos:** `src/db/errors.ts` (`isDbUnavailable`; nuevo helper interno `withCause`, que reutilizan `hasCode` y `constraintOf`), `src/db/errors.test.ts`, `src/http-errors.ts` (`serviceUnavailable`), `src/error-handler.ts` (creado), `src/error-handler.test.ts` (creado), `src/app.ts`, `src/openapi.ts`, `src/openapi.test.ts`, `apps/api/CLAUDE.md`, `docs/deuda.md`.
- **Relanzar en Fastify 5:** verificado en `lib/error-handler.js`: un `throw` síncrono dentro del manejador se captura y pasa al padre (`Object.getPrototypeOf(errorHandler)`), que en la raíz es `defaultErrorHandler`. El test del 400 lo confirma (`code: 'FST_ERR_VALIDATION'`, mensaje `body/…`).
- **`AggregateError`:** no ha hecho falta: con `127.0.0.1:1` llega `ECONNREFUSED` en el `cause` del error de Drizzle.
- **Tests que fallan sin el manejador:** comprobado comentando `setErrorHandler`: fallan los dos 503 y el 500 genérico; el 400 pasa igual (es el comportamiento de siempre).
- **`transform` de OpenAPI:** tipado como `typeof jsonSchemaTransform`; copia `schema` y `response` (no muta el de la ruta) con `{ 503: ErrorResponseSchema, ...response }`, así el `503` de la ruta gana. Comprobado a mano que el 503 aparece convertido a JSON Schema en todas las rutas del documento. Mirar el `if (!schema)`: el tipo dice que siempre hay, pero se deja por si una ruta sin `schema` llega al `transform`.
- **Para la revisión:** el manejador registra con `request.log.error` también los 500 («Error no controlado»), antes los registraba Fastify; con `logger: false` en tests no se ve.

### Mejoras R1 y R2 (R3 ya estaba aplicada)

- **Archivos:** `src/error-handler.ts`, `src/error-handler.test.ts`.
- **R1:** el 4xx se comprueba antes que `isDbUnavailable`; comentario del manejador reordenado con el porqué (cuerpo cortado = `ECONNRESET` + `statusCode: 400`). Test con una ruta `/aborted` que lanza ese error → 400.
- **R2:** `error.statusCode ?? error.status` (con un cast local: `status` no está en `FastifyError`); el manejador de Fastify también lo acepta (`lib/error-handler.js`), así que al relanzar responde con ese código. Test con `/status-404` → 404 con su mensaje.
- Sin desviaciones. typecheck, lint y 334 tests en verde.

## Revisión

Resultado: lista para terminar (segunda vuelta: R1, R2 y R3 aplicadas y comprobadas; typecheck, lint y 334 tests en verde; sin propuestas nuevas).

- [x] **R1 · recomendable · `apps/api/src/error-handler.ts:12`** (aceptada) — `isDbUnavailable` se mira antes que el 4xx. Si un cliente corta la subida del cuerpo, Node emite `Error: aborted` con `code: 'ECONNRESET'` y Fastify le pone `statusCode = 400` (`lib/content-type-parser.js`); el manejador lo toma por BD caída: 503 y `log.error('La BD no responde')`, un falso aviso → comprobar primero el 4xx y después `isDbUnavailable` (un error de `postgres`/Drizzle nunca trae `statusCode`), y un test con una ruta que lance `{ code: 'ECONNRESET', statusCode: 400 }` → 400. `ECONNRESET` es un código de red genérico, no exclusivo de la BD.
- [x] **R2 · opcional · `apps/api/src/error-handler.ts:16`** (aceptada) — Fastify acepta también `error.status` como código (lo usan librerías como `http-errors`); aquí un error con `status: 404` y sin `statusCode` acabaría en 500 → mirar `error.statusCode ?? error.status`. Hoy ningún código lo lanza; solo previene sorpresas con plugins futuros.
- [x] **R3 · opcional · trivial · `apps/api/src/openapi.ts:14`** (aceptada) — el `if (!schema)` que pide mirar el registro sí hace falta: `@fastify/swagger` llama a `transform` con `route.schema`, que es `undefined` en rutas sin `schema` (como la `/boom` del test) → dejarlo con un comentario de una línea que lo explique, para que nadie lo quite por fiarse del tipo.

## Cierre

- **Documentado:** `apps/api/CLAUDE.md` (`error-handler.ts` en la estructura, `isDbUnavailable`, `serviceUnavailable` y la regla del 503/500 genérico en «Códigos HTTP con intención»); una nota en «Notas» de `fase-1-plan.md`.
- **Deuda:** borrada «Si la BD cae, las rutas protegidas dan 500, no 503»; añadida «Arranque sin BD» (fase 4). `Retry-After` y reintentos automáticos se descartan hasta que haya un cliente que los necesite.
- **Conceptos añadidos:** ninguno más allá de los de «Conceptos nuevos».

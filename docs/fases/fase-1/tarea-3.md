# Tarea 3 — OpenAPI

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo
Las rutas de la API se definen con esquemas Zod de `@jarvis/schemas` que sirven a la vez para validar la entrada, validar y serializar la respuesta, tipar el handler y generar la documentación OpenAPI, visible en `/docs` (Swagger UI). `/health` queda migrada como ruta de referencia del nuevo patrón.

## Decisiones
- **`fastify-type-provider-zod` + `@fastify/swagger` + `@fastify/swagger-ui`** — lo decide el plan: una sola fuente (Zod) para validación, tipos y documentación.
- **`/docs` siempre expuesta, también en producción** — API doméstica dentro de casa; no revela nada que no se descubra llamándola.
- **Plugins de rutas tipados con `FastifyPluginAsyncZod`** — TypeScript infiere `body`/`params`/`query` y lo que se puede devolver desde el `schema`, sin anotar tipos a mano ni repetir `withTypeProvider` en cada archivo.
- **Se valida también la respuesta** (el `serializerCompiler` de Zod) — si un handler devuelve algo que no cumple el esquema, 500 en vez de filtrar datos (importará con `passwordHash`).
- **`ErrorResponseSchema` común en `packages/schemas`** con la forma por defecto de Fastify (`statusCode`, `code?`, `error`, `message`) — las tareas 5–14 documentan 400/401/403/409 igual y la web lee `message` sin adivinar. Sin *error handler* propio ni códigos de error de aplicación (fuera de alcance).

## Especificación

### Dependencias (`apps/api`)
- `fastify-type-provider-zod` (versión compatible con Zod 4 y Fastify 5), `@fastify/swagger`, `@fastify/swagger-ui`. Comprobar compatibilidad al instalar.
- Tras instalar: `docker compose up -d --build -V`.

### `packages/schemas/src/error.ts` (crear)
```ts
export const ErrorResponseSchema = z.object({
  statusCode: z.number().int(),
  code: z.string().optional(),   // p. ej. FST_ERR_VALIDATION
  error: z.string(),             // "Bad Request"
  message: z.string(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
```
Reexportado en `index.ts`. En esta tarea no lo usa ninguna ruta (`/health` no tiene errores de cliente); queda listo para la 5.

### `src/openapi.ts` (crear)
- `export async function registerOpenApi(app)` (o plugin equivalente) que registra:
  - `@fastify/swagger` con `openapi: { info: { title: 'Jarvis API', version: '0.0.0' } }` y `transform: jsonSchemaTransform` (de `fastify-type-provider-zod`), para que convierta los esquemas Zod a JSON Schema.
  - `@fastify/swagger-ui` con `routePrefix: '/docs'`. El documento queda en `/docs/json`.
- Debe registrarse **antes** que las rutas: `@fastify/swagger` descubre las rutas con un hook `onRoute`.

### `src/app.ts` (modificar)
- `app.setValidatorCompiler(validatorCompiler)` y `app.setSerializerCompiler(serializerCompiler)`.
- Registrar OpenAPI y después las rutas. `buildApp` sigue siendo síncrona (Fastify encola los `register`; `inject()` y `listen()` esperan a `ready`).

### `src/routes/health.ts` (modificar)
- `export const healthRoutes: FastifyPluginAsyncZod = async (app) => { ... }`.
- `schema`: `tags: ['sistema']`, `summary` breve, `response: { 200: HealthResponseSchema, 503: HealthResponseSchema }`.
- Mismo comportamiento: 200 `{status:'ok',db:'up'}` / 503 `{status:'error',db:'down'}`. Sin anotación `Promise<HealthResponse>`.

### `apps/api/CLAUDE.md` (modificar)
- Estructura: añadir `src/openapi.ts`.
- Patrones: rutas con `FastifyPluginAsyncZod` y `schema` (`tags`, `summary`, `body`/`params`/`querystring`, `response` con todos los códigos que devuelve, errores con `ErrorResponseSchema`); se valida también la respuesta; documentación en `/docs`.
- "Pendiente de decidir": quitar la integración Zod ↔ Fastify (resuelta); queda solo la estructura de módulos (tarea 9).

## Archivos
- `apps/api/package.json` (+ `pnpm-lock.yaml`) — modificar: dependencias.
- `packages/schemas/src/error.ts` — crear: `ErrorResponseSchema`.
- `packages/schemas/src/index.ts` — modificar: reexportar.
- `apps/api/src/openapi.ts` — crear: registro de swagger y swagger-ui.
- `apps/api/src/app.ts` — modificar: compiladores Zod y registro de OpenAPI.
- `apps/api/src/routes/health.ts` — modificar: nuevo patrón.
- `apps/api/src/openapi.test.ts` — crear: tests de `/docs`.
- `apps/api/CLAUDE.md` — modificar: convenciones.

## Subtareas
- [x] **3.1 — todo:** dependencias, esquema de error, OpenAPI, compiladores Zod, `/health` migrada y convenciones. Tests: los de abajo.

## Tests
No obligatorios (no tocan auth, roles ni permisos).
- [x] `GET /docs/json` → 200, `openapi` empieza por `3.` e incluye `paths['/health'].get` con respuestas `200` y `503`.
- [x] `GET /docs` (o la ruta a la que redirija) → 200 con HTML.
- [x] Los tests existentes de `/health` (200 con BD, 503 sin BD) pasan sin cambios.

## Conceptos nuevos
- **Type provider de Fastify:** enseña a Fastify a inferir los tipos del handler desde el `schema` de la ruta (aquí, esquemas Zod).
- **Validator / serializer compiler:** funciones que Fastify usa para validar la entrada y serializar la salida de cada ruta; al cambiarlas por las de Zod, el esquema Zod manda en ambos sentidos.
- **OpenAPI:** especificación estándar (JSON) que describe la API; Swagger UI la pinta como página interactiva para probar endpoints.

## Fuera de alcance
- *Error handler* propio y códigos de error de aplicación — si hacen falta, en la tarea que los necesite.
- Seguridad en OpenAPI (cookie / Bearer como `securitySchemes`) — tarea 5 o 6, con la autenticación.
- Estructura de módulos para varias entidades — tarea 9.
- Prefijo `/api` detrás de Caddy/Vite — tarea 15.

## Registro de implementación
### 3.1 — todo
- **Archivos:** `apps/api/package.json` + `pnpm-lock.yaml` (`fastify-type-provider-zod@^7.0.0`, `@fastify/swagger@^9.9.3`, `@fastify/swagger-ui@^6.1.3`; peers: Zod ≥4.1.5, Fastify ^5.5 — compatibles), `packages/schemas/src/error.ts` (nuevo), `packages/schemas/src/index.ts`, `apps/api/src/openapi.ts` (nuevo), `apps/api/src/app.ts`, `apps/api/src/routes/health.ts`, `apps/api/src/openapi.test.ts` (nuevo), `apps/api/CLAUDE.md`, `eslint.config.js`.
- **Desviaciones:**
  - `eslint.config.js` (no previsto): `@typescript-eslint/require-await` desactivada en `apps/api/src/routes/**`. `FastifyPluginAsyncZod` exige un plugin `async`, y registrar rutas no necesita `await`, así que esto le pasaría a cada archivo de rutas.
  - `health.ts`: `return { status: 'ok', db: 'up' } as const`. Como el otro camino devuelve `reply.code(503).send(...)`, TS ensanchaba `'ok'` a `string` y no cumplía el tipo inferido del esquema. No hay anotación `Promise<HealthResponse>`, tal como pide la especificación.
- **Para la revisión:** el peer `openapi-types` de `fastify-type-provider-zod` no está instalado, y typecheck pasa sin él. En `openapi.test.ts`, el test de `/docs` sigue la redirección si la hay; hoy responde 200 directamente. Comprobado también en Docker tras `--build -V`: `/docs/json` (OpenAPI 3.0.3 con los enums de `HealthResponseSchema`) y `/docs` → 200 HTML; tests en el contenedor: 17/17.

## Revisión
Resultado: lista para terminar (solo pulido; typecheck, lint y tests 17/17 en verde)

Especificación y tests cumplidos. Las desviaciones (`as const`, `require-await` off en `routes/`) están justificadas. El peer `openapi-types` sí está resuelto en el lockfile (`openapi-types@12.1.3`, lo trae `@fastify/swagger`): no hay nada que hacer.

- [x] **R1 · recomendable · trivial · `apps/api/CLAUDE.md` (patrón "Se valida también la respuesta")** — Dice "si el handler devuelve algo que no cumple el esquema, 500 (no se filtran campos de más)", pero el `serializerCompiler` hace `safeEncode` con `z.object`, que **elimina en silencio** las claves de más; el 500 solo salta si falta un campo o no encaja su tipo (aceptada) → reescribir: "las claves que no estén en el esquema se eliminan (no se filtran, p. ej. `passwordHash`); si falta un campo o no encaja, 500". Es la convención que leerán las tareas 5–14 y hoy induce a esperar un 500 que no llega.
- [x] **R2 · opcional · trivial · `apps/api/src/openapi.test.ts:31-38`** — El seguimiento manual de la redirección es código muerto (hoy `/docs` responde 200 directo) (aceptada) → un solo `inject` a `/docs`. Si una versión futura redirige, el test fallará con un mensaje claro y se ajusta entonces.

## Cierre
- **Documentado:** convenciones de rutas con Zod/OpenAPI, validación de la respuesta y `/docs` en `apps/api/CLAUDE.md` (más la excepción de `require-await` en `routes/**`); nota en "Notas" de `fase-1-plan.md`.
- **Pendiente para otras tareas:** `securitySchemes` (cookie/Bearer) en OpenAPI → tarea 5/6; primer uso de `ErrorResponseSchema` → tarea 5; si la tarea 9 mueve las rutas fuera de `routes/`, actualizar el glob de `eslint.config.js`.

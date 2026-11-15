# Tarea 6 — Autorización

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

Piezas reutilizables para proteger rutas: `authenticate` (¿quién eres? → 401) y `requireRole(...)` (¿puedes? → 403). Al terminar, cualquier grupo de rutas de las tareas 7+ se protege con una línea y declara sus errores en OpenAPI sin repetirlos.

## Decisiones

- **Plugin `auth` con `fastify-plugin`** que decora `request.user` y expone `app.authenticate` — `fastify-plugin` rompe el encapsulamiento para que el decorador sea visible en toda la app.
- **`authenticate` como hook `onRequest` a nivel de plugin de rutas** (`app.addHook('onRequest', app.authenticate)`) — todo lo registrado dentro queda protegido por defecto; olvidarlo en una ruta suelta no es posible.
- **`requireRole(...roles)` por ruta como `preHandler`, con lista explícita** (`requireRole('admin', 'adult')`), sin jerarquía — se lee sin recordar el orden de roles y admite casos no jerárquicos.
- **La renovación de la cookie se mueve a `authenticate`** — la sesión deslizante se renueva con cualquier petición autenticada, no solo con `/auth/me`.
- **`/auth/me` usa `authenticate` por ruta** (`onRequest: app.authenticate`), porque comparte plugin con `/auth/login`, que es pública.
- **Tests con rutas de prueba registradas en el propio test** — aún no hay endpoints protegidos reales.

## Especificación

### `apps/api/src/auth/authenticate.ts` (nuevo)

- `declare module 'fastify'`: `FastifyRequest.user: AuthUser` (tipo de `@jarvis/schemas`) y `FastifyInstance.authenticate: onRequestHookHandler` (o equivalente async).
- `authPlugin` (envuelto con `fastify-plugin`), opción `{ cookieSecure: boolean }`:
  - `app.decorateRequest('user', null)` (el valor real se asigna en el hook; tipar sin `| null` para no forzar comprobaciones en cada ruta: solo se lee tras `authenticate`).
  - `app.decorate('authenticate', async (request, reply) => { ... })`:
    1. `getRequestToken(request)`; si `null` → 401.
    2. `validateSession(app.db, token)`; si `null` → 401.
    3. Si `renewed` y `source === 'cookie'` → `reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(cookieSecure))`.
    4. `request.user = session.user`.
  - 401 con cuerpo `{ statusCode: 401, error: 'Unauthorized', message: 'No autenticado' }` (`ErrorResponseSchema`), respondido con `return reply.code(401).send(...)`.
- `requireRole(...roles: Role[])` → `preHandlerAsyncHookHandler`: si `!roles.includes(request.user.role)` → 403 `{ statusCode: 403, error: 'Forbidden', message: 'No tienes permiso' }`.
- Constantes para los esquemas de rutas:
  - `sessionSecurity` (se mueve aquí desde `routes/auth.ts`): `[{ bearerAuth: [] }, { cookieAuth: [] }]`.
  - `authErrorResponses = { 401: ErrorResponseSchema, 403: ErrorResponseSchema }` para hacer `response: { 200: X, ...authErrorResponses }`. Una ruta con `authenticate` pero sin `requireRole` puede declarar solo el 401.

Uso esperado en la tarea 7+:

```ts
export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);
  app.get('/users', { preHandler: requireRole('admin'), schema: { security: sessionSecurity, response: { 200: ..., ...authErrorResponses } } }, ...);
};
```

### `app.ts`

- Registrar `authPlugin` con `{ cookieSecure }` después de `cookie` y antes de las rutas.

### `routes/auth.ts`

- `/auth/me`: `onRequest: app.authenticate`, handler `return { user: request.user }`. Respuestas igual que hoy (200, 401).
- Importa `sessionSecurity` de `auth/authenticate.ts`. Login y logout no cambian.

### Dependencia

- `fastify-plugin` en `dependencies` de `apps/api` (`pnpm --filter @jarvis/api add fastify-plugin`). No requiere cambios en Docker (mismo `package.json`), pero sí `docker compose up -d --build -V`.

## Archivos

- `apps/api/package.json` — modificar: `fastify-plugin`.
- `apps/api/src/auth/authenticate.ts` — crear: plugin, `requireRole`, `sessionSecurity`, `authErrorResponses`.
- `apps/api/src/auth/authenticate.test.ts` — crear: tests con rutas de prueba.
- `apps/api/src/app.ts` — modificar: registrar `authPlugin`.
- `apps/api/src/routes/auth.ts` — modificar: `/auth/me` con `authenticate`; importar `sessionSecurity`.
- `apps/api/CLAUDE.md` — modificar: patrón "Rutas protegidas" (hook por plugin + `requireRole` por ruta + `authErrorResponses`/`sessionSecurity`).

## Subtareas

- [x] **6.1 — todo:** plugin, `requireRole`, refactor de `/auth/me`, docs. Tests: los de abajo; los de `routes/auth.test.ts` siguen en verde sin cambios.

## Tests

En `authenticate.test.ts`, sobre `buildTestApp()` registrando antes del primer `inject` un plugin de prueba con `addHook('onRequest', app.authenticate)` y rutas: `GET /test/any` (sin `requireRole`, devuelve `request.user`), `GET /test/admin` (`requireRole('admin')`), `GET /test/adult` (`requireRole('admin', 'adult')`). Todos obligatorios (auth y roles):

- [x] sin token → 401 con `ErrorResponseSchema` y mensaje «No autenticado»
- [x] Bearer con token desconocido → 401
- [x] sesión caducada → 401
- [x] usuario desactivado → 401
- [x] sesión válida (Bearer y cookie) → 200 y `request.user` con id, nombre, email y rol, sin `passwordHash`
- [x] invitado en `/test/admin` → 403 «No tienes permiso»; adulto en `/test/admin` → 403
- [x] admin en `/test/admin` → 200; adulto en `/test/adult` → 200; invitado en `/test/adult` → 403
- [x] sin token en una ruta con `requireRole` → 401 (no 403: `authenticate` corre antes)
- [x] por cookie, con sesión a menos de 15 días, una ruta cualquiera (no `/auth/me`) reemite la cookie; por Bearer, no hay `set-cookie`
- [x] `routes/auth.test.ts` sigue pasando sin cambios (regresión de `/auth/me`)

## Conceptos nuevos

- **Autenticación vs autorización:** 401 = no sé quién eres; 403 = sé quién eres y no puedes. Por eso `authenticate` corre siempre antes que `requireRole`.
- **Hooks del ciclo de vida de Fastify:** `onRequest` (antes de parsear el cuerpo; ideal para auth, no gasta en parsear peticiones anónimas) y `preHandler` (justo antes del handler). Si un hook responde, la petición se corta ahí.
- **Encapsulamiento y `fastify-plugin`:** cada plugin es un contexto aislado; los hooks y decoradores no salen de él salvo que se envuelva con `fastify-plugin`. Por eso el hook `authenticate` añadido en un plugin de rutas solo afecta a sus rutas.
- **Decorar la request (`decorateRequest`):** Fastify pide declarar las propiedades de antemano para mantener la forma del objeto estable (rendimiento de V8).

## Fuera de alcance

- Autorización por fila (solo el dueño modifica sus lecturas) — tarea 14.
- Endpoints de usuarios con roles reales — tarea 7.
- Límite de intentos de login (`@fastify/rate-limit`) — deuda anotada, sin tarea.

## Registro de implementación

### 6.1 — todo

- **Archivos:** `apps/api/package.json` (+`fastify-plugin`), `pnpm-lock.yaml`, `src/auth/authenticate.ts` (nuevo), `src/auth/authenticate.test.ts` (nuevo), `src/app.ts`, `src/routes/auth.ts`, `apps/api/CLAUDE.md`.
- **Desviaciones:**
  - `authPlugin` y el plugin de prueba del test usan el estilo de callback (`done()`) y los handlers de prueba son síncronos: con `async` sin `await` falla la regla de lint `require-await` (solo está desactivada en `routes/**`). Fastify admite ambos estilos.
  - `FastifyInstance.authenticate` se tipa como `(request, reply) => Promise<void>` en vez de `onRequestHookHandler`: sirve igual en `addHook('onRequest', ...)` y en `onRequest:` por ruta.
  - `authPlugin` declara `dependencies: ['@fastify/cookie']`: si se registrara antes que la cookie, Fastify falla al arrancar en vez de romper en la primera petición.
- **Para la revisión:**
  - `decorateRequest('user', null as unknown as AuthUser)`: el cast es lo que permite tipar `request.user` sin `| null` (decisión de la especificación). Si una ruta sin `authenticate` lee `request.user`, obtiene `null` sin aviso de TS.
  - `/auth/me` conserva `401` en su `response` (no usa `authErrorResponses`, no tiene `requireRole`). En `routes/auth.ts` sigue el helper `unauthorized` (lo usa el login).
  - Verificado en Docker tras `--build -V`: `GET /auth/me` sin sesión → 401 «No autenticado»; `/docs/json` mantiene `security` en `/auth/me`.

## Revisión

Resultado: lista para terminar. Cumple la especificación y los 10 tests; typecheck, lint, tests (65) y formato en verde. Sin bloqueantes ni recomendables.

- [x] **R1 · opcional · trivial · `apps/api/src/auth/authenticate.test.ts:91-92`** (aceptada) — las dos comprobaciones tras `expect(res.json()).toEqual(expected)` sobran → quitar `AuthUserSchema.parse(...)` y `not.toHaveProperty('passwordHash')` (y el import de `AuthUserSchema`). `toEqual` ya es una igualdad exacta: una clave de más (`passwordHash`) lo haría fallar.

Notas (sin propuesta de cambio en esta tarea):

- Las desviaciones del registro (estilo callback por `require-await`, tipo de `app.authenticate`, `dependencies: ['@fastify/cookie']`) son correctas; la última es una mejora sobre la especificación.
- `requireRole` en una ruta sin `authenticate` lanza `TypeError` (`request.user` es `null`) → 500. Falla cerrado (nunca deja pasar) y se ve en el primer test de la ruta, así que no hace falta una guarda.
- Si la BD cae, `validateSession` lanza y toda ruta protegida responde 500, no el 503 de la convención «códigos HTTP con intención». Ya pasaba en login; arreglarlo pide un `setErrorHandler` global, fuera del alcance. Candidato a deuda en el cierre.

## Cierre

- **Documentado:** patrón «Rutas protegidas» y `authenticate.ts` en la estructura de `apps/api/CLAUDE.md` (hecho en la implementación); nota de la tarea 6 en «Notas» de `fase-1-plan.md`. Sin cambios en `docs/dominio.md` ni `.env.example`.
- **Deuda:** BD caída → 500 en rutas protegidas en vez de 503; pide un `setErrorHandler` global (sin tarea asignada). Sigue pendiente el límite de intentos de login.
- **Para la tarea 7:** primera ruta real con `authenticate` + `requireRole('admin')`; desactivar un usuario ya invalida sus sesiones vía `validateSession`.

# Tarea 5 — Login, logout y `/auth/me`

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

Al terminar, un usuario puede iniciar sesión con email y contraseña, consultar quién es (`/auth/me`) y cerrar sesión. La sesión es un token opaco guardado como hash en `sessions`; la web lo usa por cookie `httpOnly` y el asistente (fase 2) por `Authorization: Bearer`. La tarea 6 construirá `authenticate` y `requireRole` sobre esta lógica.

## Decisiones

- **Lógica de sesiones separada de las rutas** (`src/auth/session.ts`) — la tarea 6 la envuelve en el hook `authenticate` sin reescribirla; `/auth/me` y logout la llaman a mano en esta tarea.
- **Token de 32 bytes aleatorios en `base64url`; en BD solo su SHA-256 (hex)** — si alguien lee la tabla `sessions`, no puede suplantar a nadie. SHA-256 (rápido) basta porque el token ya es aleatorio e inadivinable; argon2 es para contraseñas, que son adivinables.
- **Renovación deslizante con umbral:** al validar, si quedan menos de 15 días, `expiresAt` = ahora + 30 días — como mucho un `UPDATE` cada 15 días por sesión, en vez de uno por petición.
- **Limpieza sin cron:** una sesión caducada se borra al encontrarla, y cada login borra las caducadas de ese usuario.
- **El login devuelve el token también en el cuerpo** — el asistente no gestiona cookies y lo necesita como dato para enviarlo como Bearer; la web lo ignora.
- **401 único en el login** ("Credenciales incorrectas") para email inexistente, contraseña mala y usuario desactivado — no revela qué emails existen. Si el email no existe se verifica igualmente contra un hash de relleno, para que el tiempo de respuesta tampoco lo delate.
- **Logout idempotente (204 siempre)** — cerrar una sesión que ya no existe no es un error para el cliente.
- **Si hay cabecera `Authorization`, manda ella y la cookie se ignora**; si es inválida → 401 sin probar la cookie — evita dudas sobre con qué identidad se ejecutó la petición.
- **`@fastify/cookie`** para leer y escribir cookies — "a mano" en el plan se refiere a la lógica de sesiones, no a serializar cabeceras.
- **`Secure` de la cookie inyectado por `BuildAppOptions.cookieSecure`** (`server.ts` lo activa con `NODE_ENV=production`) — sin variable de entorno nueva y comprobable en tests.
- **Varias sesiones por usuario permitidas**; el logout cierra solo la actual.
- **Sin token CSRF:** `SameSite=Lax` y una API que solo acepta JSON bastan para uso doméstico.
- **Sin límite de intentos de login** — la API solo es accesible desde la red de casa y argon2 ya frena cada intento. Queda como deuda.

## Especificación

### Esquemas (`packages/schemas/src/auth.ts`)

- `LoginRequestSchema`: `{ email, password }`. `email`: `trim` + minúsculas + formato email. `password`: string de 1 a 256 caracteres (no `PasswordSchema`: el mínimo de 8 es para crear contraseñas; aquí una corta debe dar 401, no 400).
- `AuthUserSchema`: `{ id (uuid), name, email, role (RoleSchema) }`.
- `LoginResponseSchema`: `{ user: AuthUserSchema, token: string }`.
- `MeResponseSchema`: `{ user: AuthUserSchema }`.
- Tipos inferidos exportados; reexportar desde `index.ts`.

### Lógica de sesiones (`apps/api/src/auth/session.ts`)

Funciones puras que reciben `db` (y `now = new Date()` opcional donde haga falta, para tests):

- Constantes `SESSION_TTL_MS` (30 días) y `SESSION_RENEW_THRESHOLD_MS` (15 días).
- `generateSessionToken(): string` — 32 bytes aleatorios en `base64url`.
- `hashSessionToken(token): string` — SHA-256 en hex (el `id` de la fila).
- `createSession(db, userId)` → `{ token, expiresAt }`. Borra antes las sesiones caducadas de ese usuario e inserta la nueva con `expiresAt` = ahora + 30 días.
- `validateSession(db, token)` → `{ user, expiresAt, renewed } | null`. Un `select` con `join` a `users`:
  - no existe → `null`;
  - caducada (`expiresAt <= now`) → borra la fila, `null`;
  - usuario con `active = false` → borra la fila, `null`;
  - quedan menos de 15 días → actualiza `expiresAt` a ahora + 30 días, `renewed: true`;
  - si no, `renewed: false`.
- `deleteSession(db, token)` — borra la fila si existe; no falla si no.

`createSession` de `src/test/helpers.ts` mantiene su firma (`userId`, `{ expiresAt }`) pero usa `generateSessionToken` y `hashSessionToken` en lugar de replicar el SHA-256.

### Token de la petición (`apps/api/src/auth/request-token.ts`)

`getRequestToken(request)` → `{ token, source: 'bearer' | 'cookie' } | null`:

- Con cabecera `Authorization`: si tiene la forma `Bearer <token>`, devuelve ese token con `source: 'bearer'`; con cualquier otra forma, `null`. La cookie no se mira.
- Sin cabecera: cookie `jarvis_session` → `source: 'cookie'`; sin cookie, `null`.

Exporta también `SESSION_COOKIE = 'jarvis_session'`.

### Cookie

`jarvis_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` = 30 días (en segundos), `Secure` según `cookieSecure`. Las opciones se definen en un solo sitio para que `setCookie` y `clearCookie` usen las mismas.

### Endpoints (`apps/api/src/routes/auth.ts`, tag `auth`)

| Método y ruta | Entrada | Respuestas |
| --- | --- | --- |
| `POST /auth/login` | cuerpo `LoginRequestSchema` | 200 `LoginResponseSchema` + `Set-Cookie` · 400 validación · 401 "Credenciales incorrectas" |
| `POST /auth/logout` | cookie o Bearer (opcionales) | 204 sin cuerpo + cookie borrada |
| `GET /auth/me` | cookie o Bearer | 200 `MeResponseSchema` · 401 "No autenticado" |

- **Login:** busca el usuario por email. Verifica siempre la contraseña (contra el hash del usuario o, si no existe, contra un hash de relleno calculado una sola vez). 401 si no existe, la contraseña no coincide o `active = false`. Si todo va bien: `createSession`, cookie y cuerpo con `user` y `token`.
- **Logout:** si `getRequestToken` da un token, `deleteSession`. Siempre `clearCookie` y 204, haya o no sesión válida.
- **Me:** `getRequestToken` + `validateSession`; sin token o `null` → 401. Si `renewed` y `source === 'cookie'`, reemite la cookie con el nuevo `Max-Age`.
- Los 401 usan `ErrorResponseSchema` (`{ statusCode: 401, error: 'Unauthorized', message }`).
- No hay registro ni roles implicados: los tres endpoints son para cualquier usuario activo.

### App y OpenAPI

- `BuildAppOptions.cookieSecure?: boolean` (por defecto `false`); `buildApp` registra `@fastify/cookie` y `authRoutes`. `server.ts` pasa `cookieSecure: config.NODE_ENV === 'production'`.
- `openapi.ts`: `securitySchemes` `bearerAuth` (HTTP bearer) y `cookieAuth` (apiKey en cookie `jarvis_session`). `/auth/me` y `/auth/logout` declaran `security` con ambos.
- Dependencia nueva `@fastify/cookie`: tras instalarla, `docker compose up -d --build -V`.
- Sin variables de entorno nuevas ni migraciones (la tabla `sessions` ya existe).

## Archivos

- `packages/schemas/src/auth.ts` — crear: esquemas de login, usuario autenticado y `/auth/me`.
- `packages/schemas/src/index.ts` — modificar: reexportar `auth.js`.
- `apps/api/src/auth/session.ts` — crear: token, hash, crear/validar/borrar sesión.
- `apps/api/src/auth/session.test.ts` — crear: tests de la lógica de sesiones.
- `apps/api/src/test/helpers.ts` — modificar: `createSession` usa las funciones reales.
- `apps/api/src/auth/request-token.ts` — crear: extraer el token de cookie o Bearer.
- `apps/api/src/routes/auth.ts` — crear: login, logout y me.
- `apps/api/src/routes/auth.test.ts` — crear: tests de los endpoints.
- `apps/api/src/app.ts` — modificar: `cookieSecure`, `@fastify/cookie`, `authRoutes`.
- `apps/api/src/server.ts` — modificar: pasar `cookieSecure`.
- `apps/api/src/openapi.ts` — modificar: `securitySchemes`.
- `apps/api/package.json` (+ `pnpm-lock.yaml`) — modificar: `@fastify/cookie`.
- `apps/api/CLAUDE.md` — modificar: `src/auth/` (sesiones, token de la petición) y patrón de cookie.

## Subtareas

- [x] **5.1 — Lógica de sesiones:** `auth/session.ts`, sus tests y `createSession` de los helpers con las funciones reales. Sin rutas ni dependencias nuevas. Tests: los del bloque "Sesiones".
- [x] **5.2 — Endpoints y cookie:** esquemas Zod, `@fastify/cookie`, `request-token.ts`, rutas `/auth/*`, `cookieSecure`, `securitySchemes` y `CLAUDE.md` de la API. Tests: los del bloque "Endpoints".

## Tests

Todos obligatorios (autenticación), contra Postgres real.

### Sesiones (`session.test.ts`) — 5.1

- [x] `createSession` guarda el SHA-256 del token, no el token, y `expiresAt` ≈ ahora + 30 días
- [x] `createSession` borra las sesiones caducadas de ese usuario y no toca las vigentes ni las de otros
- [x] `validateSession` con token válido devuelve el usuario y `renewed: false`
- [x] `validateSession` con token desconocido → `null`
- [x] `validateSession` con sesión caducada → `null` y la fila se borra
- [x] `validateSession` con usuario desactivado → `null` y la fila se borra
- [x] `validateSession` con menos de 15 días restantes → `renewed: true` y `expiresAt` ≈ ahora + 30 días en la BD
- [x] `validateSession` con más de 15 días restantes no cambia `expiresAt`
- [x] `deleteSession` borra la sesión y no falla con un token inexistente

### Endpoints (`auth.test.ts`) — 5.2

- [x] login correcto → 200 con `user` (sin `passwordHash`) y `token`, y cookie `jarvis_session` con `HttpOnly`, `SameSite=Lax` y `Path=/`
- [x] login con el email en mayúsculas y con espacios → 200
- [x] login con contraseña incorrecta → 401
- [x] login con email inexistente → 401 con el mismo cuerpo que el caso anterior
- [x] login de usuario desactivado → 401
- [x] login sin `email` o sin `password` → 400
- [x] con `cookieSecure: true` la cookie lleva `Secure`; por defecto no
- [x] `/auth/me` con la cookie del login → 200 con el usuario
- [x] `/auth/me` con el `token` del login como Bearer → 200 con el usuario
- [x] `/auth/me` sin token → 401
- [x] `/auth/me` con sesión caducada → 401
- [x] `/auth/me` con usuario desactivado después del login → 401
- [x] `/auth/me` con Bearer inválido y cookie válida → 401 (manda la cabecera)
- [x] `/auth/me` por cookie con menos de 15 días restantes → 200 y reemite la cookie; con más de 15 días no hay `Set-Cookie`
- [x] logout → 204, cookie borrada y el mismo token da 401 en `/auth/me` (por cookie y por Bearer)
- [x] logout sin sesión → 204
- [x] logout cierra solo la sesión actual: otra sesión del mismo usuario sigue valiendo

## Conceptos nuevos

- **Sesión opaca frente a JWT:** el token es un identificador aleatorio sin información; el servidor consulta la BD en cada petición. Cuesta una consulta, pero revocar es borrar una fila. Un JWT se valida sin BD, pero no se puede revocar antes de que caduque.
- **Guardar el hash del token, no el token:** igual que con las contraseñas, una fuga de la BD no da sesiones utilizables. Aquí vale SHA-256 porque el token tiene 256 bits de azar.
- **Cookie `HttpOnly` / `SameSite` / `Secure`:** `HttpOnly` la oculta al JavaScript (protege de XSS), `SameSite=Lax` evita que otros sitios la envíen en peticiones `POST` (protege de CSRF) y `Secure` la limita a HTTPS.
- **Cookie frente a `Authorization: Bearer`:** la cookie la gestiona el navegador solo; el Bearer lo pone a mano un cliente que no es un navegador (el asistente).
- **Renovación deslizante:** la sesión se alarga mientras se usa, así que solo caduca por inactividad.
- **Enumeración de usuarios y ataques de tiempo:** responder igual, y tardar lo mismo, exista o no el email evita que el login sirva para descubrir cuentas.
- **Idempotencia:** repetir un logout da el mismo resultado que hacerlo una vez.
- **Parser de contenido (content-type parser):** Fastify convierte el cuerpo según `Content-Type` antes de validar. Se puede sustituir el parser, por ejemplo para aceptar un JSON vacío, y delegar el resto en el de por defecto, que protege de `__proto__`.

## Fuera de alcance

- Hook `authenticate` y `requireRole` — tarea 6 (reutiliza `getRequestToken` y `validateSession`).
- Invalidar las sesiones al desactivar un usuario y cambio de contraseña — tarea 7 (aquí ya se rechaza y borra la sesión de un usuario desactivado al validarla).
- Límite de intentos de login (`@fastify/rate-limit`) — deuda, a anotar en las notas del plan.
- Pantalla de login en la web — tarea 16.
- Cómo guarda el asistente el token — fase 2.

## Registro de implementación

### 5.1 — Lógica de sesiones

- **Archivos:** `apps/api/src/auth/session.ts` (creado), `apps/api/src/auth/session.test.ts` (creado), `apps/api/src/test/helpers.ts` (`createSession` usa `generateSessionToken`, `hashSessionToken` y `SESSION_TTL_MS`).
- **Desviaciones:** ninguna. Concreción: `validateSession` devuelve `user` solo con `id`, `name`, `email` y `role` (forma de `AuthUserSchema`), sin `passwordHash` ni `active`; hay un test que comprueba que no sale `passwordHash`.
- **A mirar en la revisión:** `now` es opcional en `createSession` y `validateSession`, pero los tests usan el reloj real y comparan con margen de 5 s (`expectAbout`). El borrado de sesiones caducadas por login usa `expiresAt <= now`, igual que la validación.

### 5.2 — Endpoints y cookie

- **Archivos:** creados `packages/schemas/src/auth.ts`, `apps/api/src/auth/request-token.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/routes/auth.test.ts`; modificados `packages/schemas/src/index.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/openapi.ts`, `apps/api/src/test/helpers.ts`, `apps/api/package.json`, `pnpm-lock.yaml`, `apps/api/CLAUDE.md`.
- **Desviaciones / concreciones:**
  - `sessionCookieOptions(secure)` vive en `request-token.ts` junto a `SESSION_COOKIE` (la especificación pedía "un solo sitio" sin fijar cuál).
  - `cookieSecure` llega a `authRoutes` como opción del plugin (`FastifyPluginAsyncZod<AuthRoutesOptions>`), no como decorador: solo lo usan estas rutas.
  - `buildTestApp(options)` acepta las opciones de `buildApp` salvo `db`, para el test de `cookieSecure` (no estaba en "Archivos" como cambio de helpers).
  - El hash de relleno se calcula perezosamente en el primer login (no al importar el módulo, para no pagar argon2 al arrancar ni en tests que no lo usan).
  - Logout declara `204: z.null()` y responde `send(null)`; Fastify no envía cuerpo en un 204.
- **A mirar en la revisión:** el login busca por `users.email` con el email ya normalizado por Zod; depende de que los emails se guarden en minúsculas (el seed ya lo hace; las futuras altas de usuarios también deberán). El regex de Bearer es `^Bearer (\S+)$` (sensible a mayúsculas en "Bearer"). Contenedor reconstruido con `--build -V` y `/docs/json` muestra los `securitySchemes`.
- **Cuerpo vacío con `Content-Type: application/json` (detectado probando con Bruno):** `POST /auth/logout` sin cuerpo pero con esa cabecera responde 400 `FST_ERR_CTP_EMPTY_JSON_BODY` (comportamiento por defecto de Fastify), no 204. Sin la cabecera, o con `{}`, funciona. Afecta a cualquier POST sin cuerpo y puede afectar a la web si su cliente pone esa cabecera siempre. Decidir en la revisión: aceptar cuerpo vacío en la API (p. ej. un parser de JSON que lo trate como `undefined`) o dejarlo como regla del cliente (no enviar `Content-Type` sin cuerpo) y documentarlo.

### Mejoras de la revisión (R1, R3)

- **Archivos:** `apps/api/src/app.ts` (parser de JSON), `apps/api/src/routes/auth.test.ts` (test "con Content-Type: application/json y sin cuerpo responde 204"), `packages/schemas/src/user.ts` (`EmailSchema` y tipo `Email`), `packages/schemas/src/auth.ts` (usa `EmailSchema`).
- **Desviaciones:** ninguna. Concreciones de R1: el cuerpo llega como `string | Buffer` en el tipo aunque `parseAs: 'string'`, así que se normaliza con `toString()`; la llamada al parser por defecto lleva `void` (su tipo admite promesa, pero responde por `done`; lo pedía `no-floating-promises`). Solo el cuerpo exactamente vacío pasa a `undefined`; uno con solo espacios sigue dando 400.
- **A mirar en la revisión:** el test nuevo falló primero con 400 y pasa tras el cambio (52/52). En el contenedor, `POST /auth/login` sin cuerpo con esa cabecera da 400 (Zod informa "received null": Fastify convierte el `undefined` en `null`). `seed.ts` sigue validando `ADMIN_EMAIL` con `z.email()` y `seedAdmin` normaliza a mano; no se ha cambiado a `EmailSchema` porque R3 no lo pedía.

### Mejora de la revisión (R5)

- **Archivos:** `apps/api/src/db/seed.ts` (`ADMIN_EMAIL: EmailSchema`), `apps/api/src/db/seed-admin.ts` (parámetro `email: Email`, sin `trim().toLowerCase()`), `apps/api/src/db/seed-admin.test.ts`.
- **Desviaciones:** el test de `seedAdmin` pasaba `' Admin@Casa.Local '` y comprobaba que se guardaba en minúsculas; como `seedAdmin` ya no normaliza, ahora recibe `'admin@casa.local'` y el título del test ya no menciona las minúsculas. La normalización queda cubierta por `EmailSchema` (y el test de login con mayúsculas y espacios).
- **A mirar en la revisión:** el tipo `Email` es `string` a efectos de TypeScript (no es un tipo "marcado"), así que no impide pasar un email sin normalizar: es documentación. Seed probado en el contenedor (con el admin existente responde "no se modifica"). 52/52 tests.

## Revisión

Resultado: lista para terminar (3.ª vuelta: R5 y R6 aplicadas y correctas; typecheck, lint, tests 52/52 y formato en verde).

- [x] **R1 · recomendable · `apps/api/src/app.ts:27`** — `POST` sin cuerpo con `Content-Type: application/json` da 400 `FST_ERR_CTP_EMPTY_JSON_BODY` (logout, y cualquier POST futuro sin cuerpo) → en `buildApp`, sustituir el parser de JSON por uno que trate el cuerpo vacío como `undefined` y delegue el resto en `app.getDefaultJsonParser('error', 'error')` (conserva la protección de `__proto__`/`constructor`), con un test "logout con `Content-Type: application/json` y sin cuerpo → 204". Muchos clientes `fetch` ponen esa cabecera siempre; una regla oculta para el cliente es más frágil que una API tolerante, y el login sigue dando 400 porque Zod recibe `undefined`. (aceptada)
- [ ] **R2 · opcional · `apps/api/src/auth/request-token.ts:25`** — el esquema `Bearer` es sensible a mayúsculas; el estándar HTTP (RFC 9110) dice que no → regex con `/i` y un caso `bearer <token>` en el test. Ningún cliente nuestro lo escribe en minúsculas hoy: es pulido. (descartada: ningún cliente lo necesita)
- [x] **R3 · opcional · `packages/schemas/src/auth.ts:7`** — el login depende de que los emails se guarden en minúsculas, y solo el seed lo garantiza → extraer `EmailSchema` (`trim` + minúsculas + `z.email()`) en `user.ts` y usarlo aquí, para que el alta de usuarios (tarea 8) lo reutilice. Evita que un alta con mayúsculas cree un usuario que no puede entrar. (aceptada)
- [x] **R4 · opcional · trivial · `apps/api/CLAUDE.md` (sección Tests)** — la línea "Peticiones con `app.inject()` sobre `buildTestApp()`…" está duplicada (la segunda, con el paréntesis mal colocado) → borrar la segunda. (aceptada)
- [x] **R5 · opcional · `apps/api/src/db/seed.ts:10`** — `ADMIN_EMAIL` se valida con `z.email()` y `seedAdmin` normaliza a mano (`seed-admin.ts:16`), duplicando lo que ahora hace `EmailSchema` → usar `EmailSchema` en `seed.ts` y quitar el `trim().toLowerCase()` de `seedAdmin` (o tiparlo como `Email`). Una sola regla de normalización; no es trivial porque toca dos archivos y acepta espacios alrededor del email del `.env`. (aceptada)
- [x] **R6 · opcional · trivial · `apps/api/CLAUDE.md` (sección Tests)** — al quitar el duplicado de R4 se perdió la primera línea, que existía en `main`: "Vitest, archivo junto al código (`foo.ts` → `foo.test.ts`)." → restaurarla. Es la convención de dónde van los tests. (aceptada)

Tercera vuelta: R5 deja una sola regla de normalización (`EmailSchema`) para el login y el seed; el test de `seedAdmin` ya no prueba la normalización, pero la cubre el test de login con mayúsculas y espacios.

Segunda vuelta: el parser de JSON solo convierte en `undefined` el cuerpo exactamente vacío y delega el resto en el de Fastify (conserva la protección de `__proto__`); el test nuevo cubre el caso. `EmailSchema` se usa en el login y queda documentado para las altas.

Sin observaciones en lo demás: la especificación y los 26 tests se cumplen, el `passwordHash` no sale (lo quita el esquema de respuesta y hay test), el hash de relleno iguala tiempos, la cabecera manda sobre la cookie y las opciones de la cookie viven en un solo sitio.

## Cierre

- **Documentado:** `apps/api/CLAUDE.md` (`src/auth/`, cookie de sesión, token de la petición, cuerpo vacío, `EmailSchema`, `buildTestApp(options)`); notas de `fase-1-plan.md` (punteros para las tareas 6 y 7 y la deuda).
- **Para otras tareas:** tarea 6: `authenticate`/`requireRole` sobre `getRequestToken` + `validateSession` y `security` en OpenAPI. Tarea 7: `EmailSchema` en el alta e invalidar sesiones al desactivar.
- **Deuda:** no hay límite de intentos de login. El esquema `Bearer` es sensible a mayúsculas (R2 descartada).

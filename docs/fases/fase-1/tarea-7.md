# Tarea 7 — Gestión de usuarios (admin)

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

El admin puede listar, ver, crear y editar usuarios (nombre, email, rol, activo) y resetearles la contraseña; admin y adulto pueden cambiar su propia contraseña. Al terminar, la casa se gestiona sin tocar la BD y la tarea 20 (web) tiene todos los endpoints que necesita.

## Decisiones

- **Rutas de gestión en `routes/users.ts`, todas solo `admin`** — un plugin protegido con `app.authenticate` como hook y `requireRole('admin')` por ruta (patrón de la tarea 6).
- **Cambiar la propia contraseña en `PUT /auth/password`** (plugin `auth`) — trata de tu sesión, no de gestionar usuarios.
- **Email editable en `PATCH /users/:id`** — corregir una errata sin crear otro usuario; el 409 ya hace falta para el alta.
- **El admin no puede cambiarse su propio `role` ni `active` → 409** — evita quedarse sin nadie que gestione usuarios. Más simple que «al menos un admin activo» y suficiente con un solo admin.
- **Contraseña actual incorrecta → 400, no 401** — la web tratará todo 401 como «sesión caducada» y mandaría al login; aquí la sesión es válida.
- **Email duplicado detectado por la restricción `unique` de Postgres (código `23505`)**, no consultando antes — sin carreras entre dos altas a la vez y una consulta menos.
- **Sesiones:** desactivar o resetear la contraseña borra **todas** las sesiones del usuario; cambiar la propia borra las **demás** y conserva la actual; cambiar el rol no las toca (`validateSession` lee el rol en cada petición).
- **Cambios + borrado de sesiones en una transacción** — o se aplican los dos o ninguno (no queda un usuario desactivado con sesiones vivas).
- **`User` sin fechas** (`createdAt`/`updatedAt`) — la serialización de fechas con Zod/OpenAPI se decide en la tarea 8, donde hacen falta.
- **Sin autoedición de datos propios** (salvo contraseña) — el admin cambia nombre y email; ver «Fuera de alcance».

## Especificación

### Esquemas (`packages/schemas`)

En `user.ts`:

- `UserSchema = { id: z.uuid(), name, email, role: RoleSchema, active: boolean }` → tipo `User`.
- `UserNameSchema = z.string().trim().min(1).max(100)` (reutilizado en alta y edición).
- `CreateUserRequestSchema = { name: UserNameSchema, email: EmailSchema, role: RoleSchema, password: PasswordSchema }`.
- `UpdateUserRequestSchema`: `{ name?, email?, role?, active? }` con los mismos esquemas, todos opcionales, y un `refine` que exige al menos un campo (cuerpo `{}` → 400).
- `ResetPasswordRequestSchema = { password: PasswordSchema }`.
- `UserListResponseSchema = { users: User[] }` (objeto y no array: se le pueden añadir campos sin romper clientes).
- `UserIdParamsSchema = { id: z.uuid() }` (un id mal formado → 400 de validación, no 500 de Postgres).

En `auth.ts`:

- `ChangePasswordRequestSchema = { currentPassword: z.string().min(1).max(256), newPassword: PasswordSchema }` (`currentPassword` sin el mínimo de 8, igual que el login).

Exportar los tipos con `z.infer`.

### Rutas de gestión (`apps/api/src/routes/users.ts`, nuevo)

Plugin `userRoutes` con `app.addHook('onRequest', app.authenticate)`; cada ruta con `preHandler: requireRole('admin')`, `tags: ['users']`, `security: sessionSecurity` y `...authErrorResponses` en `response`.

| Método | Ruta | Cuerpo | Respuestas |
|---|---|---|---|
| GET | `/users` | — | 200 `UserListResponse` (todos, también inactivos, ordenados por `name`) |
| GET | `/users/:id` | — | 200 `User` · 404 |
| POST | `/users` | `CreateUserRequest` | 201 `User` · 400 · 409 email duplicado |
| PATCH | `/users/:id` | `UpdateUserRequest` | 200 `User` · 400 · 404 · 409 email duplicado · 409 autoprotección |
| PUT | `/users/:id/password` | `ResetPasswordRequest` | 204 sin cuerpo · 400 · 404 |

Detalle:

- **POST:** hashea con `hashPassword` e inserta; `23505` → 409 `{ statusCode: 409, error: 'Conflict', message: 'Ya existe un usuario con ese email' }`.
- **PATCH:**
  1. Si `id === request.user.id` y el cuerpo trae `role` o `active` **distinto del valor actual** → 409 «No puedes cambiar tu propio rol ni desactivarte». (Si la web reenvía el formulario completo con los mismos valores, no falla.) Para comparar hace falta leer el usuario antes; si no existe → 404.
  2. En una transacción: `UPDATE ... RETURNING`; si pasa a `active: false`, `deleteUserSessions(tx, id)`.
  3. `23505` → 409 de email duplicado. 404 si el `UPDATE` no devuelve fila.
- **PUT password:** en una transacción, actualiza `passwordHash` y borra todas las sesiones del usuario. Si el admin se resetea a sí mismo, también cierra su sesión actual (la web usará `/auth/password` para eso). 404 si no existe.
- Mensaje de 404: «Usuario no encontrado».

### Cambiar la propia contraseña (`routes/auth.ts`)

`PUT /auth/password`, `onRequest: app.authenticate` + `preHandler: requireRole('admin', 'adult')`, cuerpo `ChangePasswordRequest`:

- Lee el `passwordHash` de `request.user.id` y `verifyPassword(hash, currentPassword)`; si falla → 400 «La contraseña actual no es correcta».
- En una transacción: actualiza el hash y `deleteUserSessions(tx, userId, { exceptToken })` con el token de la petición (`getRequestToken`).
- 204 sin cuerpo. Respuestas: 204, 400, 401, 403.

### Sesiones (`auth/session.ts`)

- `deleteUserSessions(db, userId, { exceptToken }?)`: borra las sesiones del usuario, salvo la del token dado (comparando por `hashSessionToken`). Acepta `Db` o una transacción (tipo común de Drizzle).

### Error de unicidad (`db/errors.ts`, nuevo)

- `isUniqueViolation(error): boolean` — `true` si el error (o su `cause`: Drizzle 0.45 envuelve el de `postgres` en `DrizzleQueryError`) tiene `code === '23505'`.

### Documentación

- `apps/api/CLAUDE.md`: estructura (`routes/users.ts`, `db/errors.ts`) y patrones «Conflictos de unicidad → `isUniqueViolation` → 409» y «Transacciones con `app.db.transaction(async (tx) => …)` cuando varias escrituras van juntas».
- `docs/dominio.md`: regla «el admin no puede quitarse el rol ni desactivarse» y qué pasa con las sesiones al cambiar contraseñas.

## Archivos

- `packages/schemas/src/user.ts` — modificar: `UserSchema`, `UserNameSchema`, alta, edición, reset, listado, params.
- `packages/schemas/src/auth.ts` — modificar: `ChangePasswordRequestSchema`.
- `apps/api/src/db/errors.ts` — crear: `isUniqueViolation`.
- `apps/api/src/auth/session.ts` — modificar: `deleteUserSessions`.
- `apps/api/src/routes/users.ts` — crear: rutas de gestión.
- `apps/api/src/routes/users.test.ts` — crear.
- `apps/api/src/routes/auth.ts` — modificar: `PUT /auth/password`.
- `apps/api/src/routes/auth.test.ts` — modificar: tests de cambio de contraseña.
- `apps/api/src/app.ts` — modificar: registrar `userRoutes`.
- `apps/api/CLAUDE.md`, `docs/dominio.md` — modificar: ver «Documentación».

## Subtareas

- [x] **7.1 — Gestión de usuarios:** esquemas de `user.ts`, `isUniqueViolation`, `deleteUserSessions` (sin `exceptToken` todavía si no hace falta), `GET`/`POST`/`PATCH` de `/users`, registro en `app.ts`, docs. Tests: los de «Gestión» de abajo.
- [x] **7.2 — Contraseñas:** `ResetPasswordRequestSchema`, `ChangePasswordRequestSchema`, `PUT /users/:id/password`, `PUT /auth/password`, `exceptToken` en `deleteUserSessions`. Tests: los de «Contraseñas» de abajo.

## Tests

Todos obligatorios (auth, roles y permisos), contra la BD de test con `inject()`.

### Gestión (`routes/users.test.ts`)

- [x] sin token en `GET /users` → 401
- [x] adulto e invitado en `GET /users`, `GET /users/:id`, `POST /users`, `PATCH /users/:id` → 403 (cada ruta con ambos roles)
- [x] admin `GET /users` → 200 con todos (también inactivos), ordenados por nombre, sin `passwordHash`
- [x] admin `GET /users/:id` → 200; id inexistente → 404; id no uuid → 400
- [x] admin `POST /users` → 201, email guardado en minúsculas, y el nuevo usuario puede hacer login con esa contraseña
- [x] `POST /users` con email existente (en otras mayúsculas) → 409
- [x] `POST /users` con contraseña de 7 caracteres o rol inválido → 400
- [x] admin `PATCH /users/:id` cambia nombre, email y rol → 200 con los datos nuevos
- [x] `PATCH` con email de otro usuario → 409; con cuerpo `{}` → 400; id inexistente → 404
- [x] desactivar un usuario borra sus sesiones: su token da 401 en `/auth/me`
- [x] cambiar el rol de un usuario conserva su sesión y `/auth/me` devuelve el rol nuevo
- [x] admin se desactiva o se cambia el rol a sí mismo → 409, sin cambios en la BD
- [x] admin se edita con `role: 'admin'` y `active: true` (mismos valores) y nombre nuevo → 200

### Contraseñas

- [x] adulto e invitado en `PUT /users/:id/password` → 403
- [x] admin resetea la contraseña de un usuario → 204; la nueva vale en login, la antigua no; sus sesiones previas dan 401
- [x] reset con id inexistente → 404; con contraseña corta → 400
- [x] `PUT /auth/password` sin token → 401; invitado → 403
- [x] adulto cambia su contraseña → 204; la nueva vale en login, la antigua no
- [x] tras cambiarla, su sesión actual sigue valiendo y otra sesión suya da 401
- [x] contraseña actual incorrecta → 400 y la contraseña no cambia
- [x] `newPassword` de 7 caracteres → 400

## Conceptos nuevos

- **Restricciones de unicidad como fuente de verdad:** se deja que Postgres rechace el duplicado (`23505`) y se traduce a 409, en vez de consultar antes (evita condiciones de carrera).
- **Transacciones:** varias escrituras que deben aplicarse juntas o ninguna (`db.transaction(async (tx) => …)`); si algo lanza dentro, se hace `ROLLBACK`.
- **PATCH vs PUT:** PATCH aplica un cambio parcial (solo los campos enviados); PUT reemplaza el recurso entero (aquí, la contraseña).
- **400 vs 401 vs 403 vs 409:** dato inválido, no sé quién eres, sé quién eres y no puedes, choca con el estado actual.
- **Normalización del valor que llega frente al guardado (R1):** Postgres guarda el uuid en su forma canónica (minúsculas) y lo compara sin distinguir mayúsculas, pero en JS dos textos con distintas mayúsculas son distintos. Las comparaciones de seguridad se hacen con el valor que devuelve la BD.

## Fuera de alcance

- Que un adulto edite su propio nombre o email (`PATCH /auth/me`, solo `name`): idea para más adelante si hace falta.
- Borrar usuarios: no se borran, se desactivan (plan).
- Fechas `createdAt`/`updatedAt` en la respuesta: tarea 8 decide la serialización de fechas.
- Límite de intentos en `/auth/password` y login (`@fastify/rate-limit`): deuda anotada en la tarea 5.
- Pantalla de usuarios en la web: tarea 20; cambiar contraseña en la web: tarea 16.

## Registro de implementación

### 7.1 — Gestión de usuarios

- **Archivos:** `packages/schemas/src/user.ts`; `apps/api/src/db/errors.ts` (nuevo), `db/client.ts`, `auth/session.ts`, `routes/users.ts` (nuevo), `routes/users.test.ts` (nuevo), `app.ts`; `apps/api/CLAUDE.md`, `docs/dominio.md`.
- **Desviaciones:**
  - Tipo `DbOrTx` (`PgDatabase<PostgresJsQueryResultHKT, typeof schema>`) en `db/client.ts`, archivo no listado: es el «tipo común de Drizzle» que pide `deleteUserSessions`, y ahí lo podrán reutilizar otras funciones que escriban dentro de transacciones.
  - `deleteUserSessions(db, userId)` aún sin `exceptToken` (llega en 7.2, como permite la subtarea).
  - `docs/dominio.md` ya recoge las reglas de sesiones al cambiar/resetear contraseñas, aunque esos endpoints son de la 7.2.
- **A mirar en la revisión:**
  - PATCH lee el usuario antes (para el 404 y la autoprotección) y vuelve a comprobar el 404 tras el `UPDATE` por si se borra entre medias (hoy no hay borrado, es defensivo).
  - `set(changes)` pasa el cuerpo validado directamente: Zod elimina claves desconocidas, así que no se puede colar `passwordHash`; Drizzle ignora las claves `undefined`.
  - Las sesiones se borran si el cuerpo trae `active: false`, aunque el usuario ya estuviera inactivo (inofensivo).
  - Tests de 403 lanzan las cuatro peticiones con `Promise.all` y comprueban que el PATCH denegado no cambió el nombre.

### 7.2 — Contraseñas

- **Archivos:** `packages/schemas/src/user.ts` (`ResetPasswordRequestSchema`), `packages/schemas/src/auth.ts` (`ChangePasswordRequestSchema`); `apps/api/src/auth/session.ts` (`exceptToken`), `routes/users.ts` (`PUT /users/:id/password`), `routes/auth.ts` (`PUT /auth/password`), `routes/users.test.ts`, `routes/auth.test.ts`.
- **Desviaciones:** ninguna. `apps/api/CLAUDE.md` y `docs/dominio.md` no han necesitado cambios (ya recogían estas reglas desde la 7.1).
- **A mirar en la revisión:**
  - `deleteUserSessions` añade la condición `ne(sessions.id, hash)` solo si hay `exceptToken`; `and(...)` de Drizzle ignora el `undefined`.
  - `PUT /auth/password` usa `getRequestToken(request)!`: tras `authenticate` el token existe siempre. Se conserva la sesión con la que se hace la petición, venga por Bearer o por cookie.
  - El 400 de contraseña incorrecta se decide antes de hashear la nueva (no se gasta un argon2 en vano). Si el usuario no existiera (imposible tras `authenticate`), también 400.
  - El reset del admin hashea antes de saber si el id existe (un 404 cuesta un argon2); a cambio, una sola transacción `UPDATE ... RETURNING` sin lectura previa.

### Mejoras de la revisión (R1–R3)

- **Archivos:** `apps/api/src/routes/users.ts`, `routes/users.test.ts`.
- **R1:** la autoprotección compara `current.id` (de la BD) con `request.user.id`. Test nuevo «la autoprotección no se salta con el id en mayúsculas»: falló antes del arreglo (200) y pasa después.
- **R2:** el test de desactivar comprueba en la tabla `sessions` que no quedan filas del usuario antes de llamar a `/auth/me`.
- **R3:** el test de 403 comprueba que el POST denegado no creó `nuevo@test.local`.
- **Desviaciones:** ninguna. El `UPDATE` y `deleteUserSessions` siguen usando el `id` de la URL (Postgres lo normaliza al comparar uuid); solo cambia la comparación en JS.

## Revisión

Resultado: lista para terminar

Segunda vuelta: R1–R3 aplicadas y comprobadas. La autoprotección compara `current.id` (de la BD) y el test con el id en mayúsculas da 409 sin cambios; el test de desactivar mira la tabla `sessions` antes de `/auth/me`; el de 403 comprueba que el POST no creó el usuario. Sin propuestas nuevas. Typecheck, lint y tests (92) en verde.

- [x] **R1 · bloqueante · `apps/api/src/routes/users.ts:146`** (aceptada) — la autoprotección compara el `id` de la URL con `request.user.id` como texto, pero `z.uuid()` acepta mayúsculas y Postgres compara uuid sin distinguirlas: `PATCH /users/<MI-ID-EN-MAYÚSCULAS>` con `{ active: false }` desactiva al admin → comparar `current.id` (leído de la BD, normalizado) con `request.user.id`, y añadir un test con `admin.user.id.toUpperCase()`. Incumple la regla «el admin no puede desactivarse».
- [x] **R2 · recomendable · `apps/api/src/routes/users.test.ts:252`** (aceptada) — «desactivar un usuario cierra sus sesiones» pasaría aunque se quitara `deleteUserSessions`: `validateSession` ya rechaza (y borra) sesiones de usuarios inactivos → comprobar en la tabla `sessions` que no quedan filas del usuario justo tras el PATCH, antes de llamar a `/auth/me`. Así el test protege la transacción, que es lo que se quiere probar.
- [x] **R3 · opcional · `apps/api/src/routes/users.test.ts:69`** (aceptada) — el test de 403 comprueba que el PATCH denegado no cambió nada, pero no que el POST denegado no creó el usuario → añadir que no existe `nuevo@test.local`. Mismo criterio que ya se aplica al PATCH y al reset.

## Cierre

- **Documentado:**
  - `apps/api/CLAUDE.md`: estructura (`db/errors.ts`, `DbOrTx`, `routes/users.ts`) y patrones «Conflictos de unicidad», «Transacciones» e «Ids de la URL» (comparar el id leído de la BD, no el de `params`, por R1).
  - `docs/dominio.md`: reglas de usuarios (autoprotección del admin, sesiones al cambiar el rol o la contraseña) y permisos en la tabla.
  - `fase-1-plan.md`: tarea 7 marcada, descripción con el email editable y una nota con lo reutilizable y la deuda.
- **Deuda y pendientes:**
  - Tarea 8: decidir cómo se serializan las fechas; luego valorar añadir `createdAt`/`updatedAt` a `User`.
  - Tarea 20: usar `PUT /auth/password` para la contraseña propia (`PUT /users/:id/password` sobre uno mismo cierra la sesión actual).
  - Sin `PATCH /auth/me`: un adulto no puede editar su nombre ni su email.
  - Sigue pendiente limitar los intentos de login y de `/auth/password` (tarea 5).

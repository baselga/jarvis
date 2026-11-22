# Tarea 19 — `PATCH /auth/me`: editar el propio nombre

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

Que un adulto o el admin puedan cambiar su propio nombre sin depender del admin. Cierra la deuda «No hay `PATCH /auth/me`» (tarea 7) y deja el contrato listo para la pantalla de perfil de la web (fase 2).

## Decisiones

- **Solo el nombre, no el email** — el email es con lo que se inicia sesión: una errata dejaría al usuario fuera. Lo sigue cambiando el admin con `PATCH /users/:id`.
- **El invitado no puede (403)** — es la cuenta compartida de la casa; su nombre lo pone el admin. Mismo criterio que `PUT /auth/password`.
- **Cuerpo estricto (`z.strictObject`)**: cualquier clave distinta de `name` (`role`, `active`, `email`…) → 400 — es mejor avisar al cliente de que eso no se aplica que responder 200 como si se hubiera aplicado.
- **Sin id en la URL** — la ruta actúa siempre sobre `request.user.id`: no hay forma de apuntar a otro usuario, así que no hace falta autorización por fila.
- **En `modules/auth/routes.ts`, sin `service.ts`** — una sola consulta; `auth` no tiene servicio y no se migra salvo que crezca (convención de `apps/api/CLAUDE.md`).

## Especificación

### Esquema (`packages/schemas/src/auth.ts`)

```ts
// Solo el nombre: el email lo cambia el admin. Estricto: `role`, `active`,
// `email`… dan 400 en vez de ignorarse en silencio.
export const UpdateMeRequestSchema = z.strictObject({
  name: UserNameSchema,
});
export type UpdateMeRequest = z.infer<typeof UpdateMeRequestSchema>;
```

`name` es obligatorio (es el único campo): `UserNameSchema` ya recorta espacios y exige 1–100 caracteres.

### Ruta `PATCH /auth/me`

- `onRequest: app.authenticate` (por ruta, como `GET /auth/me`) y `preHandler: requireRole('admin', 'adult')`.
- `schema`: `tags: ['auth']`, `summary: 'Cambia el nombre del usuario de la sesión'`, `security: sessionSecurity`, `body: UpdateMeRequestSchema`, `response: { 200: MeResponseSchema, 400: ErrorResponseSchema, ...authErrorResponses }`.
- `UPDATE users SET name = $1 WHERE id = <request.user.id> RETURNING id, name, email, role` y responde `{ user }` (mismo formato que `GET /auth/me`).
- No hay caso 404: los usuarios no se borran y `authenticate` acaba de leer la fila (basta un `!` comentado, como el token en `PUT /auth/password`).
- No toca sesiones: cambiar el nombre no cierra ninguna.

| Caso                                        | Respuesta |
| ------------------------------------------- | --------- |
| Sin sesión válida                           | 401       |
| Invitado                                    | 403       |
| Sin `name`, vacío, solo espacios o >100     | 400       |
| Claves extra (`role`, `active`, `email`…)   | 400       |
| Admin o adulto con nombre válido            | 200 `{ user }` |

### Documentación

- `docs/dominio.md`: fila «Cambiar su propio nombre» en la tabla de permisos (✅ admin, ✅ adulto, ❌ invitado).
- `docs/deuda.md`: quitar «No hay `PATCH /auth/me`».

## Archivos

- `packages/schemas/src/auth.ts` — modificar: `UpdateMeRequestSchema` y su tipo.
- `apps/api/src/modules/auth/routes.ts` — modificar: ruta `PATCH /auth/me`.
- `apps/api/src/modules/auth/routes.test.ts` — modificar: `describe('PATCH /auth/me')`.
- `docs/dominio.md` — modificar: fila en la tabla de permisos.
- `docs/deuda.md` — modificar: quitar la entrada resuelta.

## Subtareas

- [x] **19.1 — todo:** esquema, ruta, tests y documentación. Tests: los de abajo.

## Tests

- [x] (obligatorio) sin token → 401.
- [x] (obligatorio) invitado → 403 y su nombre no cambia.
- [x] (obligatorio) adulto cambia su nombre → 200 con `{ user }` actualizado (mismo id, email y rol); `GET /auth/me` devuelve el nombre nuevo.
- [x] (obligatorio) admin cambia su nombre → 200.
- [x] (obligatorio) con `role` o `active` en el cuerpo (junto a `name`) → 400 y no cambia ni el rol, ni el estado, ni el nombre.
- [x] con `email` en el cuerpo → 400 y el email no cambia.
- [x] sin `name`, con `name` vacío o de solo espacios → 400.
- [x] `"  Ana  "` se guarda como `"Ana"`.
- [x] solo cambia el usuario de la sesión: otro usuario conserva su nombre.

## Conceptos nuevos

- **Recurso «yo» (`/me`)**: la ruta opera sobre el usuario de la sesión en vez de sobre un id de la URL. La autorización «solo lo tuyo» queda garantizada por diseño: no hay parámetro que manipular.
- **Objeto estricto vs. *strip***: por defecto Zod elimina en silencio las claves que no conoce; `z.strictObject` las rechaza (400). Estricto cuando una clave ignorada daría al cliente la falsa impresión de haber cambiado algo (p. ej. el rol).

## Fuera de alcance

- Cambiar el propio email: lo hace el admin con `PATCH /users/:id`.
- Cambiar la propia contraseña: ya existe (`PUT /auth/password`).
- Pantalla de perfil en la web: fase 2.

## Registro de implementación

### 19.1 — todo

- **Archivos:** `packages/schemas/src/auth.ts` (`UpdateMeRequestSchema` + tipo), `apps/api/src/modules/auth/routes.ts` (`PATCH /auth/me`), `apps/api/src/modules/auth/routes.test.ts` (`describe('PATCH /auth/me')`, 13 casos), `docs/dominio.md` (fila «Cambiar su propio nombre»), `docs/deuda.md` (quitada la entrada de la tarea 7).
- **Desviaciones:** ninguna. Los tests de validación cubren además `name` de 101 caracteres (el límite de `UserNameSchema`), no pedido explícitamente.
- **Para la revisión:** el `UPDATE … RETURNING` elige columnas (`id`, `name`, `email`, `role`) en vez de devolver la fila entera; la validación de la respuesta ya quitaría `passwordHash`, pero así no sale de la BD. El `!` de `user!` va comentado (no hay caso 404). Los tests de claves extra comprueban también que el cuerpo del 400 encaja con `ErrorResponseSchema`.

## Revisión

Resultado: lista para terminar

Especificación, tests y documentación completos; typecheck, lint y tests (355) en verde. Los tests fallarían si se quitara `requireRole` (invitado), el `strictObject` (claves extra) o el `where` (otro usuario).

- [ ] **R1 · opcional · `apps/api/src/modules/auth/routes.ts:128`** — la lista `{ id, name, email, role }` del `returning` repite la de `apps/api/src/auth/session.ts:41` (la forma de `request.user` y de `MeResponseSchema`) → exportar esas columnas desde `session.ts` (p. ej. `sessionUserColumns`) y usarlas en ambos sitios. Si `MeResponseSchema` gana un campo, hoy hay que acordarse de tocar dos sitios (aunque un olvido daría 500 y lo cazarían los tests). (descartada: son 4 columnas y un olvido lo cazan los tests)

## Cierre

- **Documentado:** fila «Cambiar su propio nombre» en `docs/dominio.md`; patrón «Cuerpos estrictos» (`z.strictObject`) en `apps/api/CLAUDE.md`; nota «Perfil (tarea 19)» en `docs/fases/fase-1-plan.md`.
- **Deuda:** quitada «No hay `PATCH /auth/me`» (tarea 7) de `docs/deuda.md`. No se añade nada: la R1 (columnas del `returning` repetidas con `session.ts`) se descarta, son 4 columnas y un olvido lo cazan los tests.
- **Pendiente para otras tareas:** la pantalla de perfil de la web (fase 2) usa `PATCH /auth/me`; el email propio sigue cambiándolo el admin.

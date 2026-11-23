# Auth: sesiones y permisos

Léela si tocas el login, las sesiones, la cookie o una regla de permisos más fina que el rol. Cómo se protege una ruta con `authenticate` y `requireRole` está en `../CLAUDE.md` («Rutas protegidas»).

- **Cookie de sesión:** `jarvis_session` con las opciones de `sessionCookieOptions(secure)` (`auth/request-token.ts`), tanto en `setCookie` como en `clearCookie`. `Secure` llega por `BuildAppOptions.cookieSecure` → opción de los plugins `authPlugin` y `authRoutes`.
- **Token de la petición:** `getRequestToken(request)`; si hay cabecera `Authorization`, manda ella y la cookie se ignora.
- **Ids de la URL:** `z.uuid()` acepta mayúsculas y Postgres compara uuid sin distinguirlas. Para comparar ids en JS (p. ej. «¿soy yo?»), usa el id leído de la BD, no el de `params`. Ver la autoprotección en `modules/users/routes.ts`.
- **Autorización por fila (`PATCH`/`DELETE /readings/:id`):** además del rol, «¿esta fila es tuya?» va en el propio `WHERE` (`UPDATE/DELETE … WHERE id = $1 AND user_id = <yo> RETURNING`): una fila ajena nunca se toca. Si no cambia ninguna, una segunda consulta distingue 404 (no existe) de 403 (es de otro). El id del usuario sale de `request.user`, nunca del cuerpo. Ver `modules/readings/service.ts`.

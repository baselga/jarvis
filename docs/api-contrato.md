# Contrato de la API

Lo que necesita saber quien consume la API (la web, el asistente) sin mirar cómo está hecha por dentro. El detalle de cada endpoint está en Swagger UI (`/docs`) y los tipos de petición y respuesta en `@jarvis/schemas`: úsalos, no los copies. Quién puede hacer qué: [`dominio.md`](dominio.md).

## Autenticación

- **Login:** `POST /auth/login` con `{ email, password }` → `200 { user, token }` y la cookie `jarvis_session`. Credenciales malas o usuario desactivado → `401` (mismo mensaje, para no revelar qué cuentas existen).
- **Dos formas de mandar la sesión**, a elegir según el cliente:
  - **Cookie** (la web): `HttpOnly` y `SameSite=Lax`, la gestiona el navegador. Las peticiones deben ir con `credentials: 'include'` (o desde el mismo origen).
  - **`Authorization: Bearer <token>`** (el asistente y otros clientes que no son navegador). Si llegan las dos, manda la cabecera.
- **El asistente usa siempre el token del usuario que habla**, nunca uno de admin: así la API aplica sus permisos.
- **Duración:** 30 días desde el último uso. Mientras se usa, se renueva sola (la cookie también); solo caduca por inactividad.
- **Quién soy:** `GET /auth/me` → `{ user }` con `id`, `name`, `email` y `role` (`admin`, `adult` o `guest`).
- **Logout:** `POST /auth/logout` → `204`, también si la sesión ya no existía. Borra la sesión y la cookie.
- **Cambiar la contraseña:** `PUT /auth/password` con la actual incorrecta → `400`, no `401`: la sesión sigue siendo válida y el cliente no debe mandar al login.
- **Sesiones cerradas desde fuera:** cambiar la propia contraseña cierra las demás sesiones; un reset del admin o desactivar al usuario las cierra todas. El cliente lo nota como un `401` en la siguiente petición: debe volver al login.

## Errores

Todas las respuestas de error tienen la misma forma (`ErrorResponseSchema`):

```json
{ "statusCode": 409, "error": "Conflict", "message": "Ya existe un autor con ese nombre" }
```

`code` aparece en algunos errores de Fastify (p. ej. `FST_ERR_VALIDATION` en un 400 de validación). El `message` está pensado para personas y puede cambiar: el cliente decide por `statusCode`.

| Código | Significa                                                     | Qué hacer en el cliente                       |
| ------ | ------------------------------------------------------------- | --------------------------------------------- |
| `400`  | Datos inválidos (formato, o una regla como «devolución antes del préstamo») | Mostrar el mensaje; no reintentar igual. |
| `401`  | Sin sesión, o caducada/cerrada                                | Ir al login.                                  |
| `403`  | Tu rol no puede hacer esto, o la fila no es tuya              | No ofrecer la acción a ese rol.               |
| `404`  | No existe                                                     |                                               |
| `409`  | Choca con el estado actual: nombre repetido, libro ya prestado, borrar algo que tiene libros | Mostrar el mensaje.       |
| `500`  | Fallo interno (mensaje genérico; el detalle está en el log)   |                                               |
| `503`  | La BD no responde                                             | Reintentar más tarde.                         |

## Éxitos

- `200` con el recurso; `201` al crear (devuelve lo creado); `204` sin cuerpo al borrar y en logout y cambios de contraseña.

## Datos

- **Ids:** uuid.
- **Fechas:** días sin hora, texto `YYYY-MM-DD`. Si una fecha que tiene valor por defecto no se envía al crear (préstamo, devolución, inicio de lectura), la API pone «hoy» en la zona horaria de casa, no la del cliente.
- **`PATCH` parcial:** un campo **ausente** no cambia; **`null`** lo vacía (si admite vacío); una lista (p. ej. `authorIds` de un libro) **reemplaza** el conjunto entero, y `[]` lo vacía.
- **Claves desconocidas:** se ignoran en silencio, salvo donde ignorarlas engañaría (p. ej. mandar `role` a `PATCH /auth/me`): ahí `400`.
- **Cuerpo opcional:** los `POST` que no necesitan datos (logout, devolver un préstamo sin fecha) aceptan el cuerpo vacío aunque lleven `Content-Type: application/json`.

## Listados

- **Paginados:** `/authors`, `/genres`, `/sagas`, `/books` y `/readings`. Query `limit` (1–200, por defecto 50) y `offset` (por defecto 0). Respuesta `{ <entidad>s: [...], total }`, con `total` contando todo lo que cumple los filtros, no solo la página.
- **Sin paginar:** `/users`, `/books/:id/loans` y `/loans/active` devuelven `{ users }` o `{ loans }` completos (son listas cortas).
- **Búsqueda `q`:** «contiene», sin distinguir mayúsculas ni tildes («garcia» encuentra «García»). En libros busca en el título y en los autores.
- **Filtros de libros:** `authorId`, `genreId`, `sagaId` y `loaned` (`true`/`false`, en minúsculas). Un id que no existe da lista vacía, no error.
- **Filtros de lecturas:** `bookId` y `userId`.
- **Orden estable:** el mismo listado con distinto `offset` no repite ni salta elementos (si no cambian los datos entre medias).

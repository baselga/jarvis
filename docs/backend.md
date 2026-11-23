# Cómo está hecho el backend

Para entender la API de un tirón: cómo viaja una petición, por qué está organizada así y los conceptos que han ido apareciendo en la fase 1. Las convenciones para programar en ella están en `apps/api/CLAUDE.md` y sus guías (`apps/api/docs/`); lo que necesita un cliente, en [`api-contrato.md`](api-contrato.md).

## Las piezas

```
Docker Compose ── postgres (BD jarvis y jarvis_test)
              └── api (Node 24 + Fastify), puerto 3000
                    │
packages/schemas ───┘  esquemas Zod: validan la entrada y la salida, dan los tipos
                       de TypeScript y generan el OpenAPI de /docs
```

- **Fastify** es el servidor HTTP: rutas, hooks del ciclo de vida, plugins. Parecido a Express, pero con validación por esquema y encapsulación de plugins de serie.
- **Zod** describe la forma de los datos una sola vez, en `packages/schemas`. De ahí salen la validación de lo que entra, el filtro de lo que sale, los tipos de TS (en la API y, más adelante, en la web y el asistente) y la documentación.
- **Drizzle** es el ORM: las tablas se describen en TS (`src/db/schema/`), las consultas se escriben casi como SQL pero tipadas, y `drizzle-kit` genera las migraciones.
- **PostgreSQL** guarda los datos y además **hace cumplir reglas** (unicidad, claves foráneas, `check`), no es un almacén tonto.

## Arranque

`server.ts` lee y valida las variables de entorno (si falta algo, no arranca: *fail fast*), crea el pool de conexiones, llama a `buildApp()` y se pone a escuchar. Al recibir `SIGTERM` (Docker parando el contenedor) cierra ordenadamente: deja de aceptar peticiones, termina las que hay y cierra la BD.

`buildApp()` (`app.ts`) monta la aplicación **sin abrir un puerto**: así los tests la usan con `app.inject()`, que simula peticiones en memoria. Todo lo externo (la BD, la zona horaria) le llega como parámetro, para que un test pueda pasar otro (*inyección de dependencias*).

## Viaje de una petición

Ejemplo: un adulto presta un libro con `POST /books/:id/loans` y `{ "borrower": "Ana" }`.

1. **`onRequest` → `authenticate`** (`auth/authenticate.ts`). Lee el token de `Authorization: Bearer` o de la cookie, calcula su SHA-256 y busca la sesión en la BD. Si no hay o caducó → `401` y la petición se corta aquí. Si es válida, deja el usuario en `request.user` y, si queda poco para caducar, alarga la sesión y renueva la cookie. Va en `onRequest` porque es el primer hook: no se gasta nada en parsear el cuerpo de una petición anónima.
2. **Parseo del cuerpo.** Fastify convierte el JSON. Hay un parser propio que acepta el cuerpo vacío (útil para `POST` sin datos).
3. **Validación con Zod.** `params`, `querystring` y `body` se validan con los esquemas de la ruta. Si no encajan → `400`. A partir de aquí, los datos tienen el tipo correcto y el handler no comprueba formatos.
4. **`preHandler` → `requireRole('admin', 'adult')`.** Ya sabemos quién es (paso 1): si su rol no está en la lista → `403`. Autenticación (¿quién eres?, 401) y autorización (¿puedes?, 403) son pasos separados.
5. **Handler de la ruta** (`modules/loans/routes.ts`). Resuelve lo que es de HTTP: la fecha por defecto (`app.today()`, hoy en la zona de casa) y llama al servicio.
6. **Servicio** (`modules/loans/service.ts`). Hace el `INSERT` con Drizzle. No consulta antes si el libro ya está prestado: lo intenta, y si Postgres lo rechaza por el índice único parcial «un préstamo activo por libro», traduce ese error (`23505`) a un resultado `{ status: 'already_loaned' }`. El servicio no sabe nada de HTTP.
7. **Vuelta a la ruta.** Un `switch` sobre `status` traduce cada caso: `ok` → `201` con el préstamo, `book_not_found` → `404`, `already_loaned` → `409`. TypeScript avisa si falta un caso.
8. **Serialización.** La respuesta se valida contra su esquema: lo que no está en él se quita (nunca sale un hash por descuido) y si falta algo es un `500`, no una respuesta rota.
9. **Si algo lanza** en cualquier punto, lo recoge el manejador global (`error-handler.ts`): BD caída → `503`; error inesperado → `500` con un mensaje genérico (el detalle, con el SQL, va al log, no al cliente).

## Por qué está organizado así

- **Un módulo por entidad** (`modules/books/`, `modules/loans/`…) con `routes.ts`, `service.ts` y `routes.test.ts`: todo lo de un tema está junto.
- **Ruta y servicio separados.** La ruta es «cómo se expone por HTTP» (validar, permisos, códigos); el servicio es «qué se hace con los datos» (SQL). Así el SQL se puede reutilizar y los códigos de Postgres no se escapan del servicio.
- **Resultados explícitos en vez de excepciones** para los casos previstos (no existe, duplicado…): la ruta está obligada a tratarlos todos. Las excepciones quedan para lo imprevisto.
- **La BD como fuente de verdad de las reglas.** «Un préstamo activo por libro», «nombre de autor único», «valoración de 1 a 5», «email en minúsculas» están en Postgres, no solo en el código. Protegen todas las vías de escritura (también un script o una carrera entre dos peticiones a la vez) y la API solo traduce el error a un código HTTP.
- **Sesiones opacas en BD en vez de JWT.** Cuesta una consulta por petición, a cambio de poder cerrar sesiones al instante (logout, desactivar un usuario, cambiar la contraseña). En una casa, revocar importa más que ahorrarse esa consulta.
- **Tests contra un Postgres real** (`jarvis_test`), no contra una BD simulada: las reglas viven en la BD y hay que probarlas allí. Cada test empieza con las tablas vacías y crea lo que necesita.
- **Duplicar antes que abstraer.** Autores, géneros y sagas son tres CRUD casi iguales; se extraerá uno genérico cuando aparezca el cuarto y se vea qué cambia de verdad.

## Conceptos

Agrupados por tema. Entre paréntesis, la tarea de la fase 1 donde aparecieron (`docs/fases/fase-1/tarea-N.md`).

### HTTP y diseño de API

- **400 / 401 / 403 / 404 / 409 / 503:** dato inválido · no sé quién eres · sé quién eres y no puedes · no existe · choca con el estado actual · falla una dependencia. Un fallo de la BD es un 503, no un 500 (7, 16).
- **404 frente a 403** cuando una fila no es tuya: si existir no es secreto (las lecturas las ve toda la casa) se dice 403; si lo fuera, 404 en ambos casos (14).
- **`PATCH` frente a `PUT`:** cambio parcial frente a reemplazo completo (7). En un `PATCH`, campo ausente = no tocar y `null` = vaciar; en Zod, `.optional()` frente a `.nullable()` (11, 14).
- **Ruta de acción** (`POST /loans/:id/return`) para operaciones con reglas propias, frente a un `PATCH` de corrección sin reglas de flujo. Pueden convivir si las reglas viven en la BD (13, 20).
- **Recurso «yo» (`/auth/me`):** opera sobre el usuario de la sesión; «solo lo tuyo» queda garantizado porque no hay id que manipular (19).
- **`204 No Content`:** éxito sin cuerpo, lo habitual en un `DELETE` (20).
- **Idempotencia:** repetir la operación da el mismo resultado (un logout repetido, un seed) (4, 5).
- **Paginación `limit`/`offset` con `total`,** y orden estable (desempate por `id`) para que las páginas no se solapen (9).
- **OpenAPI:** descripción estándar de la API en JSON; Swagger UI la convierte en una página para probarla (3).

### Fastify

- **Type provider:** Fastify infiere los tipos del handler a partir del esquema de la ruta (3).
- **Validator y serializer compiler:** las funciones que validan la entrada y serializan la salida; con las de Zod, el esquema manda en ambos sentidos (3).
- **Hooks del ciclo de vida:** `onRequest` (antes de parsear el cuerpo, ideal para auth) y `preHandler` (justo antes del handler). Si un hook responde, la petición se corta (6).
- **Encapsulación de plugins:** hooks y decoradores no salen del plugin donde se registran, salvo con `fastify-plugin`. Por eso un `authenticate` añadido en un plugin de rutas solo protege esas rutas (6).
- **Decoradores** (`app.db`, `app.today()`, `request.user`): se declaran de antemano para que el objeto tenga siempre la misma forma (6).
- **Parser de contenido:** convierte el cuerpo según `Content-Type` antes de validar; se puede sustituir y delegar en el original (5). Si la ruta declara `body`, un cuerpo ausente se valida como `null`: los cuerpos opcionales son `.nullish()` (21).
- **Manejador de errores global:** recibe todo lo que se lanza; se registra antes que los plugins para que lo hereden (16).

### Seguridad y autenticación

- **Hash lento para contraseñas (argon2id), rápido para tokens (SHA-256):** una contraseña humana se puede adivinar y hay que encarecer cada intento; un token de 256 bits aleatorios no (1, 4).
- **Salt:** valor aleatorio por hash; dos contraseñas iguales dan hashes distintos. argon2 lo guarda dentro del propio hash (4).
- **Sesión opaca frente a JWT,** y guardar el hash del token, no el token: una fuga de la BD no da sesiones válidas (5).
- **Cookie `HttpOnly` / `SameSite=Lax` / `Secure`:** invisible para el JavaScript (XSS), no se envía en `POST` desde otros sitios (CSRF), solo por HTTPS (5).
- **Cookie frente a `Bearer`:** la primera la gestiona el navegador; el segundo lo pone a mano un cliente que no es navegador, como el asistente (5).
- **Renovación deslizante:** la sesión caduca por inactividad, no por antigüedad (5).
- **Enumeración de usuarios y ataques de tiempo:** el login responde igual, y tarda lo mismo, exista o no el email (5).
- **Autorización por fila:** además del rol, «¿esta fila es tuya?», resuelto en el propio `WHERE` de la escritura para que una fila ajena no se toque nunca (14).
- **Comparar con el valor normalizado de la BD:** Postgres compara uuid sin distinguir mayúsculas y JS sí; las comparaciones de seguridad usan el id leído de la BD (7).
- **Cuerpos estrictos:** Zod quita las claves desconocidas; `z.strictObject` las rechaza cuando ignorarlas engañaría al cliente (19).
- **No filtrar detalles internos en los 500:** mensaje genérico al cliente, detalle al log (16).

### Modelo de datos

- **Migraciones:** archivos SQL numerados que llevan la BD de una versión a la siguiente; Drizzle apunta cuáles se aplicaron. `generate` escribe el SQL de la diferencia; `migrate` lo aplica. Se revisan y se commitean (1).
- **Migraciones a mano** (`generate --custom`) para lo que el esquema no describe: extensiones y datos (18). Si una restricción nueva no la cumplen las filas actuales, se corrigen en la misma migración, antes del `ALTER` (17).
- **Enum de Postgres:** valores cerrados validados por la BD; añadir uno es una migración (1).
- **Clave foránea y `ON DELETE`:** `CASCADE` borra las hijas (préstamos de un libro); `RESTRICT` impide el borrado (autor con libros) (1, 8).
- **Relación N:M con tabla intermedia** y clave primaria compuesta (`book_authors`) (8). Al editar, se reemplaza el conjunto en vez de calcular diferencias (11).
- **`CHECK`, índice único parcial e índice sobre una expresión:** «valoración 1–5», «un préstamo activo por libro», «nombre único sin distinguir mayúsculas» (8).
- **Índices en claves foráneas:** Postgres no los crea solo (8).
- **`date` frente a `timestamptz`, `numeric` frente a `real`:** día de calendario frente a instante; decimal exacto frente a aproximado (8).
- **Extensiones** (`unaccent`): se activan por BD con una migración (18).

### Consultas

- **Unicidad como fuente de verdad:** se inserta y, si Postgres rechaza el duplicado (`23505`), 409. Consultar antes deja una ventana para que dos peticiones a la vez lo dupliquen (7).
- **Transacciones:** varias escrituras que se aplican todas o ninguna; si algo lanza dentro, `ROLLBACK` (7, 11).
- **`UPDATE` condicional como control de concurrencia:** la condición de estado va en el `WHERE` y se mira cuántas filas cambiaron; atómico, sin leer antes ni bloquear (13).
- **Problema N+1:** una consulta por elemento de una lista. Se evita cargando cada relación de una vez para toda la página (`IN (...)`) y repartiendo con un `Map` (12).
- **`EXISTS` correlacionado** para filtrar por una tabla relacionada sin `JOIN`, que duplicaría filas e inflaría el `COUNT` (12).
- **Padre con hijos en dos consultas** en vez de un `JOIN` que repite el padre en cada fila (10).
- **`NULLS LAST`** explícito para que la intención se lea (10).
- **Escapar `%` y `_` en `LIKE`:** no es inyección SQL (va parametrizado), pero darían resultados engañosos (9).
- **Volatilidad de funciones:** solo se indexan expresiones `IMMUTABLE`; `unaccent` es `STABLE`, por eso la búsqueda sin tildes no usa índice (18).
- **Códigos de error de Postgres:** `23505` único, `23503`/`23001` clave foránea, `23514` `CHECK`. Se traducen en el servicio y no salen de él (9, 11). Los de conexión (`ECONNREFUSED`, clase `08`, `57P0x`) son otra cosa: no dependen de la petición, y por eso son un 503 y no un 4xx (16).
- **`TRUNCATE` frente a `DELETE`:** vacía tablas de golpe, reinicia secuencias, es transaccional en Postgres (2, 22).

### Validación de entrada

- **La query string es texto:** `z.coerce` para números y `z.stringbool()` para booleanos (`z.coerce.boolean()` convierte `"false"` en `true`) (9, 12).
- **Evitar ciclos de importación** entre esquemas: el compuesto va en un archivo aparte (11).

### Fechas

- **Zona de negocio frente a la del servidor:** el contenedor va en UTC; «hoy» se calcula en la zona de casa con `Intl.DateTimeFormat` (21).
- **Reloj inyectable:** las funciones que dependen de la hora reciben `now`, y los tests lo fijan con `vi.setSystemTime` (21).

### Tests

- **BD de test separada** en el mismo servidor Postgres; vaciarla no toca la de desarrollo (2).
- **`globalSetup` frente a `setupFiles`:** una vez por ejecución (crear y migrar la BD) frente a una vez por archivo (vaciar tablas antes de cada test) (2).
- **Aislamiento:** cada test crea lo que necesita y el orden no importa; con una BD compartida, los archivos van en serie (2).
- **Tests de permisos obligatorios:** por cada endpoint, qué rol recibe 401/403 (5–7, 9–14).

### Operación

- **Fail fast en la configuración:** variables validadas con Zod al arrancar (fase 0).
- **Seed idempotente** con `INSERT … ON CONFLICT DO NOTHING` (4).
- **Scripts de desarrollo con barrera de entorno:** el que borra datos comprueba `NODE_ENV` antes de conectarse (22). `parseArgs` de `node:util` para los argumentos, sin dependencias (22).

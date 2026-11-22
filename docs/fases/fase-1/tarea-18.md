# Tarea 18 — Búsqueda sin tildes

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | normal                      |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

Los cuatro listados con `?q=` (`/authors`, `/genres`, `/sagas`, `/books`) dejan de distinguir tildes: «garcia» encuentra «García» y «García» encuentra «Garcia». Para ello se usa la extensión `unaccent` de Postgres, instalada con una migración, y un helper común que sustituye los cuatro `ilike(...)`.

## Decisiones

- Helper `containsText(col, q)` en `db/search.ts` que genera `unaccent(col) ILIKE unaccent(patrón)` — una sola pieza para los cuatro listados, así ninguno se queda sin cambiar.
- Extensión instalada con una migración personalizada (`drizzle-kit generate --custom`) con `CREATE EXTENSION IF NOT EXISTS unaccent` — la BD de test se migra sola y la recibe igual que la de desarrollo.
- Sin índice — `unaccent()` no es `IMMUTABLE` y no se puede indexar sin un wrapper. Con unos cientos de libros, recorrer la tabla cuesta microsegundos. Se apunta en `docs/deuda.md`.
- Se acepta que `unaccent` también convierta `ñ` en `n`, `ü` en `u` y `ç` en `c` («pena» encuentra «Peña») — en casa es mejor que sobre un resultado a que falte uno, y mucha gente escribe sin ñ. Un diccionario propio añadiría configuración en la BD que no compensa.
- `containsPattern` se mantiene (lo usa `containsText`) — el escape de `%`, `_` y `\` sigue siendo necesario, y `unaccent` no toca esos caracteres.

## Especificación

- **Migración:** `pnpm --filter @jarvis/api db:generate --custom --name=unaccent` crea `drizzle/0003_unaccent.sql` (+ snapshot y journal). Contenido:
  ```sql
  -- unaccent quita tildes y diacríticos ('García' → 'Garcia'). Viene con Postgres (contrib)
  -- y es «trusted»: no exige superusuario para instalarla.
  CREATE EXTENSION IF NOT EXISTS unaccent;
  ```
  Se aplica al reiniciar `api` en desarrollo y en el `globalSetup` de los tests.
- **`apps/api/src/db/search.ts`:** nueva función exportada
  ```ts
  // «col contiene q» sin distinguir mayúsculas ni tildes.
  export function containsText(col: AnyColumn | SQL, q: string): SQL {
    return sql`unaccent(${col}) ilike unaccent(${containsPattern(q)})`;
  }
  ```
  (el tipo del primer argumento, a criterio de la implementación: debe admitir columnas de Drizzle). Si Postgres no resuelve `unaccent` con el parámetro sin tipo, añadir `::text` al parámetro.
- **Servicios:** sustituir `ilike(col, containsPattern(q))` por `containsText(col, q)` en:
  - `modules/authors/service.ts` (`authors.name`)
  - `modules/genres/service.ts` (`genres.name`)
  - `modules/sagas/service.ts` (`sagas.name`)
  - `modules/books/service.ts`, `matchesQuery`: título y nombre de autor dentro del `EXISTS`.
  Después, quitar los imports de `ilike`/`containsPattern` que queden sin usar.
- El contrato no cambia: `q` vacío o solo con espacios sigue dando 400, el orden y `total` no cambian, y sin `q` no hay filtro.
- **Documentación:**
  - `apps/api/CLAUDE.md`: en la estructura, `db/search.ts` cita `containsText`. En «Listados con búsqueda y paginación», `q` con `containsText(col, q)` (sin tildes ni mayúsculas, vía `unaccent`).
  - `docs/deuda.md`: borrar la entrada «La búsqueda distingue tildes». Añadir en «Mejoras posibles»: búsqueda sin índice (`unaccent` no es `IMMUTABLE`), y si la biblioteca crece mucho, un wrapper `IMMUTABLE` + índice `pg_trgm` _(tarea 18)_.

## Archivos

- `apps/api/drizzle/0003_unaccent.sql`, `drizzle/meta/0003_snapshot.json`, `drizzle/meta/_journal.json` — generar con `db:generate --custom`; escribir el SQL.
- `apps/api/src/db/search.ts` — modificar: añadir `containsText`.
- `apps/api/src/modules/authors/service.ts`, `genres/service.ts`, `sagas/service.ts`, `books/service.ts` — modificar: usar `containsText`.
- `apps/api/src/modules/authors/routes.test.ts`, `genres/routes.test.ts`, `sagas/routes.test.ts`, `books/routes.test.ts` — modificar: tests nuevos.
- `apps/api/CLAUDE.md` — modificar: `containsText` en la estructura y en el patrón de listados.
- `docs/deuda.md` — modificar: borrar la entrada resuelta y apuntar lo del índice.

## Subtareas

- [x] **18.1 — todo:** migración, helper, cuatro servicios, tests y documentación. Tests: los de la sección siguiente.

## Tests

Ninguno es de la categoría obligatoria (auth, roles, permisos). El plan los pide porque es lógica SQL fácil de romper.

- [x] autores: `?q=garcia` encuentra «García Márquez, Gabriel» y no «Austen, Jane»; `total` = 1.
- [x] autores: `?q=García` encuentra «Garcia, Ana» (sin tilde en la BD): funciona en los dos sentidos.
- [x] libros: `?q=garcia` encuentra un libro por el título («Crónica de García») y otro por su autor «García Márquez»; `total` = 2.
- [x] libros: `?q=cronica` encuentra «Crónica de una muerte anunciada» (tilde en el título y en minúsculas).
- [x] géneros: `?q=ficcion` encuentra «Ciencia ficción».
- [x] sagas: `?q=senor` encuentra «El Señor de los Anillos» (la ñ también se ignora, como se decidió).
- [x] los tests de `%` y `_` que ya existen siguen en verde: el escape funciona después de `unaccent`.

## Conceptos nuevos

- **Extensiones de Postgres:** módulos que añaden funciones o tipos a la BD (`unaccent`, `pg_trgm`, `pgcrypto`…). Se activan por BD con `CREATE EXTENSION`, y por eso van en una migración. Las «trusted» las puede instalar un usuario sin ser superusuario.
- **Volatilidad de funciones (`IMMUTABLE`/`STABLE`):** Postgres solo deja indexar expresiones con funciones `IMMUTABLE` (mismo resultado siempre). `unaccent` es `STABLE` porque depende de un diccionario configurable, así que `unaccent(col)` no se puede indexar directamente.
- **Migraciones personalizadas en drizzle-kit:** `generate --custom` crea una migración vacía para el SQL que el esquema de Drizzle no describe (extensiones, datos).

## Fuera de alcance

- Índice para la búsqueda (wrapper `IMMUTABLE` + `pg_trgm`): apuntado en `docs/deuda.md`, sin tarea asignada.
- Búsqueda difusa o por relevancia (erratas, ranking): no planificada.

## Registro de implementación

### 18.1 — todo

- **Creados:** `apps/api/drizzle/0003_unaccent.sql` (con `db:generate --custom`), `drizzle/meta/0003_snapshot.json`. **Modificados:** `drizzle/meta/_journal.json`, `src/db/search.ts`, los `service.ts` y `routes.test.ts` de `authors`, `genres`, `sagas` y `books`, `apps/api/CLAUDE.md`, `docs/deuda.md`.
- `containsText(col: AnyColumn | SQL, q)`: Postgres resuelve `unaccent($1)` con el parámetro sin tipo, así que no ha hecho falta `::text`.
- En `matchesQuery` desaparece la variable `pattern`: cada `containsText` calcula su patrón (dos llamadas a `containsPattern` por consulta, irrelevante).
- Sin desviaciones de la especificación.
- **Para la revisión:** la migración se ha probado solo en `jarvis_test` (los tests se lanzaron desde el host con el `TEST_DATABASE_URL` del `.env` del repo principal, porque el worktree no tiene `.env`). La BD de desarrollo la recibirá al reiniciar `api` con esta rama. En libros, el test de tildes en autor y título comprueba el orden (`Cien años…` antes que `Crónica…`), no solo el `total`.

## Revisión

Resultado: lista para terminar

Especificación, tests y documentación cumplidos; typecheck, lint, Prettier y 342 tests en verde (BD `jarvis_test`). La migración solo pone `CREATE EXTENSION IF NOT EXISTS` (idempotente) y `postgres:18-alpine` incluye `unaccent`. El escape de `%`, `_` y `\` sigue cubierto (tests de listado + `db/search.test.ts`).

- [x] **R1 · opcional · trivial · `apps/api/src/modules/books/routes.test.ts:252`** — `response.json<BookListResponse>()` se parsea dos veces → guardarlo en una constante (`const body = …`). Pulido de lectura, nada más. (aceptada)

## Cierre

- **Documentado:** `apps/api/CLAUDE.md` — `containsText` en la estructura y en «Listados con búsqueda y paginación»; en «Cambiar el modelo», cómo hacer una migración personalizada (`db:generate --custom`). Notas de `fase-1-plan.md`: usar `containsText` en cualquier `q` nuevo.
- **Deuda:** en `docs/deuda.md` se borra «La búsqueda distingue tildes» y se añade «Búsqueda sin índice» (wrapper `IMMUTABLE` + `pg_trgm` si la biblioteca crece).
- **Pendiente:** la BD de desarrollo recibe `unaccent` al reiniciar `api` con esta rama (solo se probó en `jarvis_test`).

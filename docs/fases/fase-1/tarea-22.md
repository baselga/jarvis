# Tarea 22 — Datos de ejemplo

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | pequeña                     |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

Un script de desarrollo, `pnpm --filter @jarvis/api db:sample`, separado de `db:seed`, que llena la BD con una biblioteca realista (unas decenas de libros con autores, géneros, sagas, préstamos y lecturas) y un usuario adulto y otro invitado, para empezar la web (fase 2) con datos. Se niega a ejecutarse en producción.

## Decisiones

- **Lista fija en el código, sin faker** — deterministas (siempre los mismos libros, fáciles de buscar desde la web), sin dependencias nuevas y con casos límite elegidos a mano.
- **Inserciones directas con Drizzle en una sola transacción**, no a través de los servicios de los módulos — o se crea todo o nada; los servicios hacen una escritura por llamada y aquí no aportan validación que necesitemos (los datos son nuestros y la BD sigue aplicando sus `check`).
- **Se niega si ya hay datos, salvo con `--reset`** — sin flag no hay riesgo de duplicar ni de borrar; `--reset` es cómodo para iterar en la web.
- **`--reset` no toca al admin ni a otros usuarios**: vacía las tablas de la biblioteca y borra solo los dos usuarios de ejemplo — el admin sale de `db:seed` y no debe perderse al regenerar datos.
- **Usuarios con email y contraseña fijos** (`jarvis-dev`), mostrados al terminar — solo existen en desarrollo; meterlos en `.env` sería configuración sin beneficio.
- **Fechas relativas a hoy en `HOME_TZ`** — un préstamo activo o una lectura en curso siguen pareciendo recientes aunque se relance meses después.
- **Barrera de producción: `NODE_ENV=production` → error antes de conectar** — además `tsx` es devDependency y no existe en la imagen `prod`.

## Especificación

### Comando

```
docker compose exec api pnpm --filter @jarvis/api db:sample [--reset]
```

Script `"db:sample": "tsx --conditions=development src/db/sample.ts"` en `apps/api/package.json` (mismo estilo que `db:seed`). Verificar al implementar que `--reset` llega al script a través de `pnpm --filter … db:sample --reset`; si pnpm exige `--`, documentarlo así.

### Flujo de `src/db/sample.ts`

1. `loadConfig()`. Si `NODE_ENV === 'production'` → `console.error('db:sample no se ejecuta en producción')`, `process.exitCode = 1` y fin, sin conectar a la BD.
2. Argumentos con `parseArgs` de `node:util` (`strict: true`, opción booleana `reset`). Un argumento desconocido → mensaje de error y `exitCode = 1`, sin conectar.
3. `createDb(config.DATABASE_URL)`; todo lo que sigue dentro de `db.transaction(async (tx) => …)`; `close()` en `finally` (como `seed.ts`).
4. **¿Hay datos?** Sí si existe alguna fila en `books`, `authors`, `genres` o `sagas`, o algún usuario con uno de los emails de ejemplo.
   - Con datos y sin `--reset` → lanza un error controlado; fuera de la transacción se muestra `La BD ya tiene datos de la biblioteca o usuarios de ejemplo. Usa --reset para borrarlos y volver a crearlos.` y `exitCode = 1`. No se escribe nada.
   - Con `--reset` → `TRUNCATE books, authors, genres, sagas, book_authors, book_genres, loans, readings` (con `sql` de Drizzle; `CASCADE` no hace falta si se listan todas) y `DELETE` de los usuarios con los emails de ejemplo (sus sesiones caen por `ON DELETE CASCADE`). Ojo: las lecturas de cualquier usuario (también las del admin) se borran, porque son de la biblioteca.
5. **Crear** (orden por dependencias): usuarios → autores, géneros, sagas → libros → `book_authors`, `book_genres` → préstamos → lecturas. Inserciones en lote (`insert(...).values([...]).returning()`) y `Map` de nombre → id para resolver las referencias de los datos.
6. **Lector admin:** el primer usuario `role = 'admin'` y `active = true` (orden `createdAt`); si no hay ninguno, las lecturas del admin se omiten y el resumen lo dice (`Sin admin: ejecuta db:seed para tener también sus lecturas`).
7. **Resumen** por consola al terminar: cuántos libros, autores, géneros, sagas, préstamos (activos/devueltos) y lecturas se crearon, y las credenciales de los dos usuarios.
8. Cualquier otro error → `console.error('Error al crear los datos de ejemplo:', error)` y `exitCode = 1` (rollback por la transacción).

### Usuarios

| Nombre  | Email                   | Rol     | Contraseña   |
| ------- | ----------------------- | ------- | ------------ |
| Adulto  | `adulto@jarvis.local`   | `adult` | `jarvis-dev` |
| Invitado| `invitado@jarvis.local` | `guest` | `jarvis-dev` |

Hash con `hashPassword` (`auth/password.ts`), una vez y reutilizado para los dos. `active: true`. Nombres concretos a criterio (p. ej. «Lucía», «Invitados»); los emails, constantes exportadas en `sample-data.ts`.

### Datos (`src/db/sample-data.ts`)

Solo datos y tipos, sin acceso a BD. Los libros referencian autores, géneros y saga **por nombre**; préstamos y lecturas referencian el libro por título y llevan las fechas como **días antes de hoy** (`loanedDaysAgo`, `returnedDaysAgo`, `startedDaysAgo`, `finishedDaysAgo`). `sample.ts` las convierte con un helper local `daysAgo(today, n): DateString` (aritmética en UTC sobre `YYYY-MM-DD`; `today` = `todayIn(config.HOME_TZ)`).

Volumen orientativo: ~40 libros reales (mayoría en español), ~25 autores, ~8 géneros, ~5 sagas, ~4 préstamos activos y ~6 devueltos, ~15 lecturas del adulto y ~5 del admin. Debe incluir:

- Autores con tildes y eñes (García Márquez, Martín Gaite, Muñoz Molina…) para probar la búsqueda sin tildes.
- Un libro con dos autores; un libro sin género; libros sin saga.
- Una saga con orden decimal (`2.5`) y una con huecos en el orden.
- Campos opcionales variados: algunos con `isbn`, `year`, `language`, `location` y `notes`, otros sin ellos.
- Un libro con varios préstamos devueltos y uno activo; préstamos con `borrower` de texto libre («Marta (vecina)»).
- Lecturas: terminadas con valoración, una en curso (solo `startedAt`), una solo con `finishedAt`, alguna con `note`, y algún libro leído por el adulto y por el admin.
- Todas las fechas cumplen los `check` de la BD (devuelto ≥ prestado, terminado ≥ empezado) y como mucho un préstamo activo por libro.

## Archivos

- `apps/api/src/db/sample-data.ts` — crear: datos de ejemplo, tipos y emails de los usuarios.
- `apps/api/src/db/sample.ts` — crear: script (barrera de producción, `--reset`, transacción, resumen).
- `apps/api/package.json` — modificar: script `db:sample`.
- `apps/api/CLAUDE.md` — modificar: `sample.ts` y `sample-data.ts` en «Estructura».
- `CLAUDE.md` (raíz) — modificar: comando `db:sample` en «Comandos».

## Subtareas

- [x] **22.1 — todo.** Tests: ninguno (lo fija el plan); verificación manual abajo.

## Tests

Sin tests automáticos (plan de la fase: basta con que `pnpm -r lint` pase y el script se ejecute sobre una BD vacía). Verificación manual:

- [x] `pnpm -r typecheck` y `pnpm -r lint` pasan; `pnpm -r test` sigue en verde.
- [x] Sobre una BD sin biblioteca (solo el admin), `db:sample` crea los datos y muestra el resumen y las credenciales.
- [x] Relanzarlo sin `--reset` → mensaje de «ya tiene datos», `exitCode` 1 y nada cambia.
- [x] Con `--reset` → vuelve a crear los datos; el admin sigue existiendo y puede iniciar sesión.
- [x] `NODE_ENV=production` → se niega sin conectar.
- [x] Un argumento desconocido (`--foo`) → error.
- [x] Login con `adulto@jarvis.local` / `jarvis-dev` funciona; `GET /books?q=garcia` encuentra los libros de García Márquez; `GET /loans/active` devuelve los activos.

## Conceptos nuevos

- **`TRUNCATE` frente a `DELETE`:** vacía tablas enteras de golpe, sin recorrer filas; es transaccional en Postgres (un `ROLLBACK` lo deshace). Si una tabla referenciada no está en la lista, falla salvo con `CASCADE`.
- **Scripts de desarrollo con barrera de entorno:** un script que borra datos comprueba `NODE_ENV` antes de conectarse, y no depende solo de que la herramienta (`tsx`) falte en producción.
- **`parseArgs` de `node:util`:** parseo de argumentos de línea de comandos sin dependencias; con `strict: true` rechaza opciones desconocidas.

## Fuera de alcance

- Datos de ejemplo de fases futuras (compra, tareas, recetas): cada fase amplía `sample-data.ts` si lo necesita.
- Ejecutar `db:sample` automáticamente al arrancar el contenedor.
- Tests automáticos del script.

## Registro de implementación

### 22.1 — todo

- **Archivos:** `apps/api/src/db/sample-data.ts` y `apps/api/src/db/sample.ts` (creados); `apps/api/package.json` (script `db:sample`), `apps/api/CLAUDE.md` («Estructura») y `CLAUDE.md` raíz («Comandos»).
- **Datos:** 42 libros, 28 autores, 9 géneros, 5 sagas, 4 préstamos activos y 6 devueltos, 15 lecturas del adulto y 5 del admin (20 si hay admin). El usuario adulto se llama «Lucía» y el invitado «Invitados».
- **Tipos literales:** autores, géneros y sagas son arrays `as const`, y los libros `as const satisfies readonly SampleBook[]` para sacar `BookTitle`: una errata en un nombre o título de préstamo/lectura no compila. Fuera se exportan como `SampleBook[]` (iterar la unión literal de 42 objetos complica el acceso a campos opcionales). `idOf` sigue lanzando si falta algo en un `Map`, por si acaso.
- **`daysAgo` usa `toISOString().slice(0, 10)`**, que el `CLAUDE.md` de la API prohíbe para «hoy». Aquí es correcto: parte de un día ya resuelto en `HOME_TZ` y hace aritmética de calendario en UTC a medianoche, sin hora que pueda cambiar el día. Comentado en el código.
- **`hasData` y `reset` con `sql` crudo** (`exists (...) or ...` y `truncate`): Drizzle no tiene builder para `TRUNCATE` ni para un `select exists` sin `from`.
- **El hash de `jarvis-dev`** se calcula una vez antes de abrir la transacción (argon2 es lento).
- **`--reset` llega sin `--`** (`pnpm --filter @jarvis/api db:sample --reset` funciona tal cual).
- **Verificación manual hecha** en el contenedor: primera ejecución, repetición sin `--reset` (exit 1 con el mensaje), `--reset` (el admin sigue en `users`; no he probado su login porque no conozco la contraseña), `--foo` (`Unknown option '--foo'`, mensaje de Node en inglés, más el uso), `NODE_ENV=production` con un `DATABASE_URL` a un host inexistente (se niega sin intentar conectar), login de `adulto@jarvis.local`, `GET /books?q=garcia` (7 libros: García Márquez, García Lorca y García Sáenz de Urturi), `GET /loans/active` (4) y lecturas de Patria de dos usuarios.
- **Incidencia de entorno, sin cambio de código:** la BD de desarrollo no tenía aplicada la migración 0003 (`unaccent`), así que `?q=` daba 500 hasta reiniciar `api` (lo que ya avisa la nota de la tarea 18). Lo he reiniciado.
- **Para la revisión:** las fechas de los datos cumplen los `check` (devuelto ≥ prestado, terminado ≥ empezado, al menos una fecha) y hay como mucho un préstamo activo por libro; si no, la transacción fallaría entera (no ha fallado).

## Revisión

Resultado: lista para terminar

Sin mejoras propuestas. Comprobado:

- Cumple la especificación: barrera de producción antes de conectar, `parseArgs` estricto, comprobación de datos y `--reset` dentro de una sola transacción, orden de inserción, lector admin opcional y resumen con credenciales. Volumen y casos límite pedidos presentes (tildes, libro con dos autores, sin género, saga con `2.5` y con hueco, préstamos repetidos y uno activo, lectura en curso y solo con `finishedAt`, libros leídos por adulto y admin).
- Los datos encajan con las reglas de la BD y de `@jarvis/schemas`: fechas de préstamos y lecturas en orden, un préstamo activo por libro, valoraciones 1–5, ISBN de 13 dígitos, idioma de dos letras, orden de saga múltiplo de 0.1.
- `--reset` vacía `readings` antes de borrar los usuarios de ejemplo, así que su `ON DELETE RESTRICT` no salta; las sesiones caen en cascada y el admin no se toca.
- `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test` (389 tests) y Prettier en verde.

## Cierre

- **Documentado:** comando `db:sample [--reset]` en «Comandos» del `CLAUDE.md` raíz; `sample.ts` y `sample-data.ts` en «Estructura» de `apps/api/CLAUDE.md`; nota en «Notas» de `fase-1-plan.md` (credenciales y qué ampliar en `sample.ts` cuando una fase añada tablas).
- **Deuda:** ninguna nueva. Los datos de fases futuras los añade cada fase a `sample-data.ts` (ver la nota del plan).
- **Pendiente:** era la última tarea de la fase 1; falta `/jarvis-phase close 1`.

# Tarea 15 — Ordenar imports

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | terminada                   |
| Tamaño | pequeña                     |
| Fase   | 1                           |
| Plan   | `docs/fases/fase-1-plan.md` |

## Objetivo

ESLint exige imports y `export ... from` ordenados en todo el monorepo y lo corrige solo con `--fix`. Va antes que el resto del bloque 1c para que el código nuevo ya nazca ordenado. No cambia comportamiento.

## Decisiones

- **`eslint-plugin-simple-import-sort`** (v14) — dos reglas con autofix, ordena también los nombres dentro de las llaves (lo que señalaba la deuda) y casi no se configura. `import-x/order` y `perfectionist` dan más de lo necesario.
- **Grupos por defecto del plugin** — bloques separados por una línea en blanco (efectos secundarios, `node:`, paquetes incluido `@jarvis/*`, absolutos, relativos). Cero configuración; el autofix añade las líneas en blanco que hoy no hay.
- **También `exports`** — mantiene ordenado el barrel `packages/schemas/src/index.ts` al añadir entidades.
- **Nivel `error`** — como el resto de reglas: si `pnpm -r lint` pasa, está ordenado.

## Especificación

- Dependencia de desarrollo en la raíz: `eslint-plugin-simple-import-sort` (ahí están ya ESLint y sus plugins).
- En `eslint.config.js`, un bloque que aplica a todos los archivos que ya lintea (`.ts`, `.js`, `.mjs`) con:
  - `plugins: { 'simple-import-sort': simpleImportSort }`
  - `rules: { 'simple-import-sort/imports': 'error', 'simple-import-sort/exports': 'error' }`
  - Sin opciones (grupos por defecto). Va antes de `prettier`, que sigue al final; no chocan porque Prettier no ordena imports.
  - Comentario de una línea explicando el bloque, como los demás.
- Autofix en todo el monorepo: `pnpm -r lint --fix` (o `pnpm exec eslint --fix` por paquete). El diff resultante debe ser solo de orden y líneas en blanco entre imports/exports; si el plugin moviera algo con efectos secundarios o comentarios de forma rara, revisarlo a mano.
- `eslint.config.js` de la raíz no lo lintea ningún paquete (cada uno ejecuta `eslint .` en su carpeta): el import nuevo se coloca a mano en su sitio alfabético (hoy ya está ordenado) y se comprueba una vez con `pnpm exec eslint eslint.config.js` desde la raíz.
- Tras cambiar `package.json`/`pnpm-lock.yaml` de la raíz: `docker compose up -d --build -V` para que el contenedor tenga el lockfile nuevo (el `Dockerfile` instala con `--frozen-lockfile`).
- Documentación:
  - `CLAUDE.md` raíz, «Comandos»: `pnpm -r lint` → añadir que `pnpm -r lint --fix` ordena los imports (y corrige lo demás que tenga autofix).
  - `docs/deuda.md`: borrar la entrada «Imports de `@jarvis/schemas` sin ordenar».

## Archivos

- `package.json` — modificar: `eslint-plugin-simple-import-sort` en `devDependencies`.
- `pnpm-lock.yaml` — modificar: lo actualiza `pnpm add -Dw`.
- `eslint.config.js` — modificar: bloque del plugin con las dos reglas.
- `CLAUDE.md` — modificar: comando de autofix en «Comandos».
- `docs/deuda.md` — modificar: borrar la entrada resuelta.
- `apps/api/**`, `packages/schemas/**` (`.ts`/`.js`) — modificar solo con el autofix: orden de imports/exports.

## Subtareas

- [x] **15.1 — todo:** plugin, configuración, autofix en todo el monorepo y documentación. Tests: ninguno nuevo; `pnpm -r lint`, `pnpm -r typecheck` y `pnpm -r test` pasan.

## Tests

Sin tests (lo decide el plan para la tarea 15). Verificación:

- [x] `pnpm -r lint` pasa sin errores tras el autofix.
- [x] Desordenar a propósito un import en cualquier archivo hace fallar `pnpm -r lint` con `simple-import-sort/imports`, y `--fix` lo arregla (comprobar y deshacer).
- [x] `pnpm -r typecheck` y `pnpm -r test` siguen en verde (el cambio no altera comportamiento).
- [x] `docker compose up -d --build -V` levanta la API.

## Conceptos nuevos

## Fuera de alcance

- `consistent-type-imports` u otras reglas de estilo de imports (`import type` vs `type` en línea): no se pidió; se apunta en `docs/deuda.md` solo si molesta.
- Ordenar imports con Prettier (plugins de Prettier): el plan decide ESLint.

## Registro de implementación

- **15.1** — `eslint-plugin-simple-import-sort` (^14.0.0) en `devDependencies` de la raíz (`package.json`, `pnpm-lock.yaml`); bloque con las dos reglas en `eslint.config.js` (antes de `prettier`; el import nuevo, colocado a mano y comprobado con `pnpm exec eslint eslint.config.js`); `pnpm -r lint --fix` en todo el monorepo (57 archivos de `apps/api` y `packages/schemas`); `CLAUDE.md` («Comandos») y `docs/deuda.md` (entrada borrada). Sin desviaciones.
  - Diff del autofix revisado: solo orden de nombres dentro de las llaves, orden de módulos y líneas en blanco entre grupos; ningún import de efectos secundarios en el código.
  - A mirar: el orden de los barrels cambió (`db/schema/index.ts`: `library` antes que `users`; `schemas/src/index.ts`: `book` antes que `book-detail`, `loan` antes que `loan-detail`). Inocuo: cada módulo importa lo que necesita, así que el orden de evaluación no depende del barrel. Los nombres se ordenan sin distinguir mayúsculas (`createGenre` antes que `CreateGenreRequestSchema`).
  - Comprobado: desordenar `db/schema/index.ts` y `app.ts` hace fallar `lint` con `simple-import-sort/exports` e `imports`; `--fix` lo deja igual que antes. `docker compose up -d --build -V` levanta la API (`/health` ok).

## Revisión

Resultado: lista para terminar

Sin mejoras propuestas. Cumple la especificación: plugin en la raíz (lockfile solo con esa dependencia), bloque en `eslint.config.js` antes de `prettier` y sin `files` (aplica a todo lo que ya se lintea), documentación al día. El diff del autofix en `apps/api` y `packages/schemas` es solo de líneas `import`/`export`, nombres entre llaves y líneas en blanco (comprobado filtrando el diff). `typecheck`, `lint` (también `eslint eslint.config.js` desde la raíz), `format` y `test` (325/325) en verde.

## Cierre

- Documentado: comando de autofix en «Comandos» del `CLAUDE.md` raíz; nota de la tarea 15 en «Notas» de `fase-1-plan.md`. No hace falta tocar `apps/api/CLAUDE.md`: la regla la impone el lint.
- Deuda: borrada la entrada «Imports de `@jarvis/schemas` sin ordenar» de `docs/deuda.md`. Nada nuevo pendiente; `consistent-type-imports` queda fuera de alcance y no se apunta salvo que moleste.

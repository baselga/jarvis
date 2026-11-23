---
name: jarvis-finish
description: Paso 4 de 4 de una tarea en Jarvis. Usar con `/jarvis-finish [N]` para dar por terminada la tarea N (por defecto, la tarea activa), marcarla en el plan de la fase y llevar lo que haga falta a la documentación y el contexto de la aplicación, y opcionalmente hacer commit, push y PR a `master`.
argument-hint: "[N]"
disable-model-invocation: true
---

# /jarvis-finish — cerrar la tarea y documentar

Flujo: `/jarvis-spec` → `/jarvis-implement` → `/jarvis-review` → **`/jarvis-finish`**, cada paso tras `/clear`. En tareas de `Tamaño` `pequeña`, `/jarvis-review` puede ejecutar estos pasos en su misma sesión.

**Fase activa (F):** la de la línea `Fase activa` del `CLAUDE.md` raíz. Si dice que no hay ninguna, dímelo y para.
**Tarea (N):** el argumento si lo paso; si no, la de la línea `Tarea activa` del `CLAUDE.md` raíz. Si no hay ninguna, dímelo y para. Si paso un N distinto de la tarea activa, avísame y pregúntame antes de seguir.
**Rama:** si la rama actual tiene la forma `feature/F-N/…` y no coincide con F y N, avísame (no bloquea).
**Archivo de la tarea:** `docs/fases/fase-F/tarea-N.md`. Su cabecera es una tabla `| Campo | Valor |` (`Estado`, `Tamaño`, `Fase`, `Plan`); para cambiar un campo, edita solo su fila.
**Estados:** `especificada` → `en curso` → `implementada` → `revisada` → `terminada`.

No hagas commits salvo en el paso 6, si te lo confirmo. Si el `Estado` no es `revisada`, dime qué paso falta y para.

## Pasos

1. **Comprueba** que todas las subtareas y tests de `tarea-N.md` están marcados y que pasan `pnpm format:check` y los comandos de typecheck, lint y test de la sección "Comandos" del `CLAUDE.md` raíz (con `postgres` levantado si los tests usan la BD). Si algo falla, dímelo y para.
2. **Decide qué documentar.** Lee `tarea-N.md` (decisiones, registro de implementación, revisión) y los archivos que lista el registro, y propónme una lista corta de cambios, solo lo que una sesión futura necesitaría y no puede deducir rápido del código:
   - `CLAUDE.md` de la app: estructura de carpetas, cómo ejecutar algo nuevo y reglas que valgan para cualquier cambio. Un patrón de un tema concreto (p. ej. "así se hace un listado: ver `listBooks`") va en su guía (`apps/api/docs/<tema>.md`); si no encaja en ninguna, crea una y añádela a la tabla del `CLAUDE.md`. Quita lo que quede obsoleto, como "Pendiente de decidir" ya resuelto.
   - `README.md` de la app: si la tarea añade o cambia endpoints, permisos, scripts o variables de entorno.
   - `CLAUDE.md` raíz: comandos nuevos o reglas que afecten a todo el monorepo.
   - `docs/dominio.md`: si cambiaron entidades, campos, roles o reglas de permisos.
   - `.env.example`: variables nuevas.
   - "Notas" de `fase-F-plan.md` (créala al final si no existe): 1-3 líneas que las siguientes tareas necesiten (helpers reutilizables, patrones de referencia).
   - `docs/deuda.md`: deuda nueva o mejoras que se dejaron fuera (de "Fuera de alcance", mejoras descartadas de la revisión…), con su porqué y la tarea de origen; borra las entradas que esta tarea haya resuelto.
   Aplícalos cuando te parezcan bien. Mantén los `CLAUDE.md` y las guías cortos: patrones y punteros, no explicaciones (esas van a "Conceptos nuevos" de `tarea-N.md`).
3. **Marca la tarea** `[x]` en `fase-F-plan.md`. Si durante la tarea cambió algo del plan (decisión, alcance de otra tarea), actualízalo.
4. **Rellena "Cierre"** en `tarea-N.md`: qué quedó documentado y dónde, y deuda o pendientes para otras tareas. Si durante la implementación aparecieron conceptos de backend que no estaban en "Conceptos nuevos", añádelos allí. Pon `Estado` en `terminada`.
5. **Libera la tarea activa:** cambia la línea del `CLAUDE.md` raíz a `Tarea activa: ninguna (siguiente: <primera tarea sin [x] del plan>)`, o `Tarea activa: ninguna` si era la última.
6. **Commit y PR.** Propón el mensaje de commit (mismo formato que los commits recientes, p. ej. `feat(api): … (tarea N)`) y muéstrame `git status --short`. Si incluye archivos ajenos a la tarea, avísame.
   - Si la rama actual es `feature/F-N/…`, pregúntame si hago commit, push y PR a `master`. Si la rama ya tiene un PR abierto (`gh pr view`), pregunta solo por commit y push.
   - Si no es una rama de desarrollo, no ofrezcas PR: el mensaje queda propuesto, sin commitear.
   Si digo que sí:
   1. `git add -A` y `git commit` con el mensaje, sin línea `Co-Authored-By`.
   2. `git push -u origin <rama>`, nunca con `--force`. Si falla, dímelo y para.
   3. `gh pr create --base master --head <rama>`: título, el asunto del commit; cuerpo, sacado de `tarea-N.md` (resumen, decisiones clave, tests añadidos y enlace a `docs/fases/fase-F/tarea-N.md`), sin el pie "Generated with Claude Code".
   No mergees el PR.
7. **Resumen final:** 2-3 líneas.
   - Con PR: su URL, y recuérdame mergearlo antes de seguir: `/jarvis-spec` parte de `master` actualizado y comprueba que las tareas anteriores estén `[x]`.
   - Sin commit: el mensaje propuesto, y recuérdame commitear antes de seguir: `/jarvis-spec` y `/jarvis-review` cuentan con que el árbol de trabajo solo tenga la tarea en curso.
   Después, la siguiente tarea del plan (`/clear` y `/jarvis-spec`), o `/jarvis-phase close F` si era la última.

---
name: jarvis-finish
description: Paso 4 de 4 de una tarea en Jarvis. Usar con `/jarvis-finish N` para dar por terminada la tarea N, marcarla en el plan de la fase y llevar lo que haga falta a la documentación y el contexto de la aplicación.
argument-hint: "N"
disable-model-invocation: true
---

# /jarvis-finish — cerrar la tarea y documentar

Flujo: `/jarvis-spec N` → `/jarvis-implement N` → `/jarvis-review N` → **`/jarvis-finish N`**, cada paso tras `/clear`. En tareas `Tamaño: pequeña`, `/jarvis-review` puede ejecutar estos pasos en su misma sesión.

**Fase activa (F):** la de la línea `Fase activa` del `CLAUDE.md` raíz. Si dice que no hay ninguna, dímelo y para.
**Archivo de la tarea:** `docs/fases/fase-F/tarea-N.md`.
**Estados:** `especificada` → `en curso` → `implementada` → `revisada` → `terminada`.

No hagas commits. Si el estado no es `revisada`, dime qué paso falta y para.

## Pasos

1. **Comprueba** que todas las subtareas y tests de `tarea-N.md` están marcados y que pasan `pnpm format:check` y los comandos de typecheck, lint y test de la sección "Comandos" del `CLAUDE.md` raíz (con `postgres` levantado si los tests usan la BD). Si algo falla, dímelo y para.
2. **Decide qué documentar.** Lee `tarea-N.md` (decisiones, registro de implementación, revisión) y los archivos que lista el registro, y propónme una lista corta de cambios, solo lo que una sesión futura necesitaría y no puede deducir rápido del código:
   - `CLAUDE.md` de la app: patrones nuevos (p. ej. "así se hace un CRUD: ver `routes/authors.ts`"), estructura de carpetas, cómo ejecutar algo nuevo. Quita lo que quede obsoleto, como "Pendiente de decidir" ya resuelto.
   - `CLAUDE.md` raíz: comandos nuevos o reglas que afecten a todo el monorepo.
   - `docs/dominio.md`: si cambiaron entidades, campos, roles o reglas de permisos.
   - `.env.example`: variables nuevas.
   - "Notas" de `fase-F-plan.md` (créala al final si no existe): 1-3 líneas que las siguientes tareas necesiten (helpers reutilizables, patrones de referencia, deuda conocida).
   Aplícalos cuando te parezcan bien. Mantén los `CLAUDE.md` cortos: patrones y punteros, no explicaciones.
3. **Marca la tarea** `[x]` en `fase-F-plan.md`. Si durante la tarea cambió algo del plan (decisión, alcance de otra tarea), actualízalo.
4. **Rellena "Cierre"** en `tarea-N.md`: qué quedó documentado y dónde, y deuda o pendientes para otras tareas. Si durante la implementación aparecieron conceptos de backend que no estaban en "Conceptos nuevos", añádelos allí. Pon `Estado: terminada`.
5. **Resumen final:** 2-3 líneas y el mensaje de commit propuesto (sin hacerlo). Recuérdame commitear antes de seguir: `/jarvis-spec` y `/jarvis-review` cuentan con que el árbol de trabajo solo tenga la tarea en curso. Después, la siguiente tarea del plan (`/clear` y `/jarvis-spec N+1`), o `/jarvis-phase close F` si era la última.

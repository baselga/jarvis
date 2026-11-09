---
name: jarvis-implement
description: Paso 2 de 4 de una tarea en Jarvis. Usar con `/jarvis-implement [N]` para implementar la siguiente subtarea pendiente de la tarea N (por defecto, la tarea activa) o las mejoras aceptadas en su revisión, siguiendo su archivo de especificación.
argument-hint: "[N]"
disable-model-invocation: true
---

# /jarvis-implement — implementar según la especificación

Flujo: `/jarvis-spec` → **`/jarvis-implement`** → `/jarvis-review` → `/jarvis-finish`, cada paso tras `/clear`. En tareas de `Tamaño` `pequeña` puedo lanzarla justo después de `/jarvis-spec`, sin `/clear`; la revisión sí va en sesión limpia.

**Fase activa (F):** la de la línea `Fase activa` del `CLAUDE.md` raíz. Si dice que no hay ninguna, dímelo y para.
**Tarea (N):** el argumento si lo paso; si no, la de la línea `Tarea activa` del `CLAUDE.md` raíz. Si no hay ninguna, dime que falta `/jarvis-spec` y para. Si paso un N distinto de la tarea activa, avísame y pregúntame antes de seguir.
**Rama:** si la rama actual tiene la forma `feature/F-N` y no coincide con F y N, avísame (no bloquea).
**Archivo de la tarea:** `docs/fases/fase-F/tarea-N.md`. La especificación manda: no la reinterpretes. Su cabecera es una tabla `| Campo | Valor |` (`Estado`, `Tamaño`, `Fase`, `Plan`); para cambiar un campo, edita solo su fila.
**Estados:** `especificada` → `en curso` → `implementada` → `revisada` → `terminada`.

No hagas commits.

## Qué implementar en esta sesión

- Si el archivo no existe, dime que falta `/jarvis-spec` y para.
- Si el `Estado` es `revisada` o `terminada`, dime qué paso toca y para.
- Si la sección "Revisión" tiene mejoras marcadas como **aceptadas** sin aplicar (`Estado` `implementada`): aplica esas, y nada más.
- Si no, con `Estado` `especificada` o `en curso`: la **primera subtarea sin marcar**. Una subtarea por sesión.
- Si no hay nada pendiente, dímelo y para.

## Pasos

1. **Contexto.** Lee `tarea-N.md` entero, el `CLAUDE.md` de las apps que toques y los archivos de la sección "Archivos". No leas el plan de la fase salvo que la especificación lo cite. Si el `Estado` es `especificada`, ponlo en `en curso`.
2. **Tests primero en lo obligatorio** (auth, roles, permisos, herramientas del asistente): escribe esos tests, comprueba que fallan por el motivo esperado y luego implementa. El resto de tests, al final de la subtarea.
3. **Implementa en pasos pequeños**, con `pnpm -r typecheck` entre ellos. Sigue los patrones del `CLAUDE.md` de la app.
   - Si cambias algún `package.json`, reconstruye con `docker compose up -d --build -V`: el contenedor no ve las dependencias nuevas sin ello.
4. **Si algo no encaja con la especificación** (falta un dato, hay un error en ella, aparece trabajo no previsto): para y pregúntame. Si lo acordamos, actualiza la especificación antes de seguir.
5. **Verifica** con `pnpm format` y los comandos de typecheck, lint y test de la sección "Comandos" del `CLAUDE.md` raíz. Si los tests usan la BD, comprueba antes con `docker compose ps` que `postgres` está sano (si no, `docker compose up -d`). Muestra solo los errores. Si algo más necesita Docker (migraciones, servicios nuevos), compruébalo también.
6. **Actualiza `tarea-N.md`:**
   - Marca la subtarea y sus tests (o las mejoras aplicadas, `[x]`).
   - Añade al "Registro de implementación" una entrada breve: subtarea o mejoras, archivos tocados (incluidos los creados), desviaciones de la especificación y su porqué, y cualquier cosa que la revisión deba mirar con atención.
   - Si ya no quedan subtareas ni mejoras pendientes, pon `Estado` en `implementada`.
7. **Resumen:** 2-3 líneas sobre qué has hecho y el porqué de lo importante. Recuérdame `/clear` y el siguiente paso (`/jarvis-implement` si quedan subtareas; `/jarvis-review` si no).

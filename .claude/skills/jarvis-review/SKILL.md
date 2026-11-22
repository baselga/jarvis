---
name: jarvis-review
description: Paso 3 de 4 de una tarea en Jarvis. Usar con `/jarvis-review [N]` para revisar lo implementado en la tarea N (por defecto, la tarea activa) contra su especificación, proponer mejoras y aplicar directamente las triviales que acepte.
argument-hint: "[N]"
disable-model-invocation: true
---

# /jarvis-review — revisar la tarea y proponer mejoras

Flujo: `/jarvis-spec` → `/jarvis-implement` → **`/jarvis-review`** → `/jarvis-finish`, cada paso tras `/clear`.

**Fase activa (F):** la de la línea `Fase activa` del `CLAUDE.md` raíz. Si dice que no hay ninguna, dímelo y para.
**Tarea (N):** el argumento si lo paso; si no, la de la línea `Tarea activa` del `CLAUDE.md` raíz. Si no hay ninguna, dímelo y para. Si paso un N distinto de la tarea activa, avísame y pregúntame antes de seguir.
**Rama:** si la rama actual tiene la forma `feature/F-N/…` y no coincide con F y N, avísame (no bloquea).
**Archivo de la tarea:** `docs/fases/fase-F/tarea-N.md`. Su cabecera es una tabla `| Campo | Valor |` (`Estado`, `Tamaño`, `Fase`, `Plan`); para cambiar un campo, edita solo su fila.
**Estados:** `especificada` → `en curso` → `implementada` → `revisada` → `terminada`.

**Solo aplica mejoras triviales** en este paso; las demás aceptadas las aplica `/jarvis-implement`.
Trivial = local, sin cambiar comportamiento, API ni especificación, y sin tests nuevos: import o variable sobrante, nombre confuso dentro de un archivo, typo, comentario, simplificar unas pocas líneas. Ante la duda, no es trivial.
Si el `Estado` no es `implementada`, dime qué paso falta y para. Si quedan mejoras aceptadas sin aplicar, dime que falta `/jarvis-implement` y para.

## Pasos

1. **Contexto.** Lee `tarea-N.md` y el `CLAUDE.md` de las apps tocadas.
   - El código a revisar son los archivos del "Registro de implementación". Usa `git status` para detectar archivos cambiados o nuevos que falten en el registro (`git diff` no muestra los nuevos sin seguimiento).
   - Si `git status` incluye archivos ajenos a esta tarea, avísame: probablemente la anterior está sin commitear. Revisa solo los de esta.
   - Si ya hay una sección "Revisión" (segunda vuelta), céntrate en comprobar las mejoras aplicadas desde entonces y en lo que hayan tocado; no repitas propuestas descartadas.
2. **Revisa**, en este orden de importancia:
   1. **Cumplimiento:** todo lo de "Especificación" y "Tests" está hecho y se comporta así.
   2. **Corrección y seguridad:** bugs, casos límite, permisos comprobados en la API, errores con el código HTTP correcto, datos sensibles (hashes, tokens) que no se filtran en respuestas ni logs, transacciones donde hacen falta.
   3. **Tests:** cubren los casos obligatorios y fallarían si el código se rompiera (no solo comprueban el camino feliz).
   4. **Convenciones:** patrones del `CLAUDE.md`, tipos desde `packages/schemas`, nada duplicado.
   5. **Simplicidad:** código que sobra, abstracciones prematuras, nombres confusos.
   Ejecuta los comandos de typecheck, lint y test de la sección "Comandos" del `CLAUDE.md` raíz (con `postgres` levantado si los tests usan la BD) y anota lo que falle.
3. **Escribe la sección "Revisión"** de `tarea-N.md`. En una segunda vuelta, conserva las mejoras anteriores aplicadas (`[x]`) y descartadas (con su motivo) y añade las nuevas con números siguientes:

   ```markdown
   ## Revisión

   Resultado: <una línea: lista para terminar | necesita cambios>

   - [ ] **R1 · bloqueante · `ruta:línea`** — <problema> → <propuesta>. <porqué en una línea>
   - [ ] **R2 · recomendable · …**
   - [ ] **R3 · opcional · trivial · …**
   ```

   Numera en orden de gravedad: **bloqueante** (incumple la especificación, bug o fallo de seguridad), **recomendable** (mejora clara de calidad o tests), **opcional** (gusto o pulido). Marca además como **trivial** las que cumplan la definición de arriba. Sé concreto y no rellenes: si está bien, dilo.
4. **Pregúntame cuáles acepto.** Marca cada una como `(aceptada)` o `(descartada: <motivo>)`.
5. **Aplica las triviales aceptadas**, márcalas `[x]` y verifica con `pnpm format` y los comandos de typecheck, lint y test (muestra solo errores). Si al aplicar una deja de parecer trivial, deshazla y déjala para `/jarvis-implement`.
6. **Siguiente paso.** Si quedan aceptadas sin aplicar, deja `Estado` en `implementada` y recuérdame `/clear` y `/jarvis-implement`, y después volver a `/jarvis-review`. Si no, pon `Estado` en `revisada` y recuérdame `/clear` y `/jarvis-finish`.
   Si la tarea es de `Tamaño` `pequeña`, en lugar de eso pregúntame si la cierro aquí mismo; si digo que sí, lee `.claude/skills/jarvis-finish/SKILL.md` y sigue sus pasos en esta sesión.

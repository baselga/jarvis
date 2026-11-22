---
name: jarvis-spec
description: Paso 1 de 4 de una tarea en Jarvis. Usar con `/jarvis-spec [N]` para analizar la tarea N de la fase activa (por defecto, la primera pendiente del plan), resolver dudas conmigo y escribir su archivo de especificación (dividiéndola en subtareas si es grande).
argument-hint: "[N]"
disable-model-invocation: true
---

# /jarvis-spec — analizar la tarea y escribir su especificación

Flujo de una tarea, cada paso en una sesión limpia (`/clear` entre ellos), comunicados solo por el archivo de la tarea:
`/jarvis-spec` → `/jarvis-implement` → `/jarvis-review` → `/jarvis-finish`. Sin argumento, los tres últimos usan la `Tarea activa` del `CLAUDE.md` raíz.

**Fase activa (F):** la de la línea `Fase activa` del `CLAUDE.md` raíz. Si dice que no hay ninguna, dímelo y para.
**Tarea (N):** el argumento si lo paso; si no, la primera tarea sin `[x]` de `fase-F-plan.md`. Dime cuál vas a especificar. Si la línea `Tarea activa` del `CLAUDE.md` raíz apunta a otra tarea sin terminar, avísame y pregúntame antes de seguir.
**Rama de desarrollo:** `feature/F-N/<nombre>`, donde `<nombre>` describe la tarea en 2-5 palabras: minúsculas, sin tildes ni caracteres especiales (solo `a-z`, `0-9` y `-`), espacios sustituidos por guiones. Ej.: `feature/1-15/ordenar-imports`.
**Archivo de la tarea:** `docs/fases/fase-F/tarea-N.md`. Su cabecera es una tabla `| Campo | Valor |` (`Estado`, `Tamaño`, `Fase`, `Plan`); para cambiar un campo, edita solo su fila.
**Estados:** `especificada` → `en curso` → `implementada` → `revisada` → `terminada`.

No escribas código en este paso.

## Pasos

1. **Comprobaciones previas.** Avísame y pregúntame si seguimos cuando:
   - `git status` no está limpio: probablemente falta commitear la tarea anterior, y su código se mezclaría con el de esta en la revisión.
   - Alguna tarea anterior del plan no está marcada `[x]`: la especificación se basaría en código que aún no existe.
   Si `tarea-N.md` ya existe: con `Estado` `especificada`, léelo y pregúntame si lo rehacemos o lo completamos; en cualquier otro estado, no lo toques y dime qué paso toca.
2. **Rama.** Mira la rama actual (`git branch --show-current`):
   - Si ya es `feature/F-N/…` de esta tarea, sigue en ella.
   - Si es otra `feature/…`, avísame de que no coincide con F y N y pregúntame si seguimos en ella o creamos una nueva.
   - Si no es una rama de desarrollo (p. ej. `master`), pregúntame si creo una rama nueva y propón el nombre, a partir del título de la tarea N en `fase-F-plan.md`.
   Si acepto, créala desde `master` actualizado salvo que te diga otra base: `git switch master && git pull --ff-only && git switch -c <rama>`. Si el `pull` falla (p. ej. `master` local y remoto divergen), dímelo y para; no lo resuelvas por tu cuenta. Si `git status` no estaba limpio y decidí seguir, pregúntame antes qué hacer con esos cambios, porque se llevarían a la rama nueva.
   Si no la acepto, sigue en la rama actual.
3. **Contexto mínimo.** Lee:
   - La tarea N, las decisiones y la sección "Notas" (si existe) de `fase-F-plan.md`. Lo que el plan decide manda sobre secciones antiguas de los `CLAUDE.md` (p. ej. "Pendiente de decidir").
   - `docs/dominio.md` si la tarea toca entidades, roles o permisos.
   - El `CLAUDE.md` de las apps o paquetes que vaya a tocar.
   - Solo el código necesario para saber qué existe y dónde encaja lo nuevo (rutas, helpers de test, esquemas). Nada más.
4. **Entrevista.** Pregúntame todas las dudas que cambien lo que hay que construir: comportamiento, casos límite, códigos de error, forma de los datos, decisiones técnicas abiertas.
   - Como mucho 3 preguntas por mensaje, cada una con tu propuesta por defecto y por qué, para que pueda responder "vale".
   - Si una decisión es buena para aprender backend, explica brevemente las opciones.
   - No preguntes lo que ya decide el plan de la fase o el `CLAUDE.md`.
5. **Tamaño.** Divide en subtareas (`N.1`, `N.2`…) si la tarea toca más de ~8 archivos, mezcla conceptos nuevos independientes o no se podría revisar de una sentada. Cada subtarea debe dejar el proyecto compilando y con los tests en verde.
   Propón `Tamaño` `pequeña` si tiene una sola subtarea, toca ~3 archivos o menos, no lleva tests obligatorios (auth, roles, permisos, herramientas del asistente) y no tiene conceptos nuevos. Si no, `normal`. Una tarea pequeña se salta dos `/clear` (ver paso 7, `/jarvis-review` y `/jarvis-finish`); la revisión sigue siendo en sesión limpia.
6. **Escribe `tarea-N.md`** con la plantilla de abajo, muéstrame un resumen corto (objetivo, subtareas, casos de test) y **espera mi confirmación**. Ajusta lo que te pida.
7. Al confirmar, deja `Estado` en `especificada`, cambia la línea del `CLAUDE.md` raíz a `Tarea activa: N (`docs/fases/fase-F/tarea-N.md`)` y recuérdame el siguiente paso: `/clear` y `/jarvis-implement`; si es pequeña, `/jarvis-implement` directamente, sin `/clear`.

## Plantilla de `tarea-N.md`

```markdown
# Tarea N — <título>

| Campo  | Valor                       |
| ------ | --------------------------- |
| Estado | especificada                |
| Tamaño | normal \| pequeña           |
| Fase   | F                           |
| Plan   | `docs/fases/fase-F-plan.md` |

## Objetivo
<2-3 líneas: qué existe al terminar y para qué sirve.>

## Decisiones
- <decisión> — <porqué en una línea>

## Especificación
<Comportamiento concreto: endpoints (método, ruta, roles, cuerpo, respuestas y códigos), tablas/campos, esquemas Zod, scripts, variables de entorno. Lo justo para implementar sin volver a preguntar.>

## Archivos
- `ruta/archivo.ts` — crear | modificar: <qué>

## Subtareas
<Solo si se divide; si no, una sola: "N.1 — todo".>
- [ ] **N.1 — <título>:** <alcance>. Tests: <casos>.

## Tests
<Casos como frases verificables, marcando cuáles son obligatorios (auth, roles, permisos, herramientas del asistente).>
- [ ] invitado hace DELETE /authors/:id → 403

## Conceptos nuevos
<Conceptos de backend que aparecen, en 1-2 líneas cada uno. Vacío si no hay. /jarvis-phase close los usa para el resumen de la fase.>

## Fuera de alcance
- <lo que no se hace aquí y en qué tarea va>

## Registro de implementación
<Lo rellena /jarvis-implement.>

## Revisión
<Lo rellena /jarvis-review.>

## Cierre
<Lo rellena /jarvis-finish.>
```

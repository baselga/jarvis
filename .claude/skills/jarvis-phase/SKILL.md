---
name: jarvis-phase
description: Trabajo por fases en Jarvis. Usar con `/jarvis-phase N` para empezar la fase N (entrevista → plan → confirmación; las tareas se hacen luego con /jarvis-spec y siguientes) o `/jarvis-phase close N` para cerrarla y escribir su resumen.
argument-hint: "N | close N"
disable-model-invocation: true
---

# /jarvis-phase — trabajo por fases en Jarvis

Argumentos: `N` (empezar la fase N) o `close N` (cerrar la fase N).

## Empezar una fase (`/jarvis-phase N`)

1. **Contexto mínimo.** Lee solo:
   - La sección de la fase N en `docs/PLAN.md` (alcance y "terminada cuando…") y las decisiones pendientes que le afecten.
   - `docs/fases/fase-(N-1).md` si existe. No leas fases anteriores ni el código salvo que haga falta para una pregunta concreta.
   - `docs/deuda.md`: proponme qué entradas encajan en esta fase (como tareas o dentro de otras).
2. **Entrevista.** Pregúntame lo que no esté claro: funcionalidades concretas, datos, casos de uso, prioridades y decisiones técnicas abiertas.
   - Como mucho 3 preguntas por mensaje, cada una con tu propuesta por defecto y por qué, para que pueda responder "vale".
   - Cuando una decisión técnica sea buena para aprender backend, explícame brevemente las opciones.
   - Para cuando ya no queden dudas que cambien lo que hay que construir.
3. **Acuerdo.** Escribe `docs/fases/fase-N-plan.md` con:
   - Tareas numeradas y pequeñas (cada una revisable por separado), en orden.
   - Decisiones tomadas, con una línea de porqué.
   - Qué tests lleva cada tarea (obligatorios en auth, roles, permisos y herramientas del asistente).
   - Criterio de terminado de la fase.
   Si la entrevista ha definido o cambiado entidades, campos, roles o reglas de permisos, créalo o actualízalo en `docs/dominio.md` (glosario del hogar: miembros y roles, entidades con sus campos y reglas, en lenguaje de casa, no de código).
   Muéstrame un resumen corto y **espera mi confirmación**. No escribas código antes.
4. **Tareas.** Esta skill no implementa. Cada tarea del plan se hace con cuatro skills, cada una en una sesión limpia (`/clear` entre ellas) y comunicadas por `docs/fases/fase-N/tarea-M.md`:
   `/jarvis-spec` → `/jarvis-implement` (una vez por subtarea) → `/jarvis-review` → `/jarvis-finish`, y commit antes de la siguiente tarea. El número de tarea es opcional: `/jarvis-spec` toma la primera pendiente del plan y las demás la `Tarea activa` del `CLAUDE.md` raíz.
   Al confirmar el plan, pon `Fase activa: N` y `Tarea activa: ninguna (siguiente: 1)` en el `CLAUDE.md` raíz (las skills de tarea las leen de ahí) y recuérdame `/clear` y `/jarvis-spec`.

## Cerrar una fase (`/jarvis-phase close N`)

1. Comprueba que todas las tareas están marcadas en el plan y con la fila `Estado` en `terminada` en la tabla de su `tarea-M.md`, el criterio de terminado del plan, y ejecuta `pnpm format:check` y los comandos de typecheck, lint y test de la sección "Comandos" del `CLAUDE.md` raíz. Si algo falla, dímelo antes de cerrar.
2. Escribe `docs/fases/fase-N.md` (máximo ~1 página), pensado para que la siguiente sesión empiece solo con él:
   - Qué se ha construido (módulos, endpoints, tablas) y dónde está.
   - Decisiones tomadas y su porqué.
   - Comandos nuevos o cambios en `CLAUDE.md`.
   - Pendientes (la deuda vive en `docs/deuda.md`: compruébalo al día y aquí solo un puntero a lo que afecte a la siguiente fase).
   - Conceptos aprendidos: solo los títulos, con un puntero a `docs/backend.md`. Antes, añade allí los que falten, en su tema y con la tarea de origen; si la fase cambió cómo está hecho el backend (capas, viaje de una petición, decisiones de fondo), actualiza también esas secciones.
   Usa como fuente las secciones "Conceptos nuevos" y "Cierre" de cada `docs/fases/fase-N/tarea-M.md` y las "Notas" del plan, no el código entero.
3. Cambia las líneas del `CLAUDE.md` raíz a `Fase activa: ninguna (siguiente: N+1)` y `Tarea activa: ninguna`. Actualiza la sección de comandos de `CLAUDE.md` si han cambiado, y el `CLAUDE.md` de cada app tocada (y sus guías en `docs/`) si han aparecido convenciones o patrones nuevos (o crea el de una app nueva). Comprueba que `docs/dominio.md`, `docs/api-contrato.md` y el `README.md` de cada app tocada reflejan lo construido.
4. Propón el mensaje de commit (no lo hagas salvo que te lo pida) y recuérdame hacer `/clear` antes de la siguiente fase.

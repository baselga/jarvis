---
name: fase
description: Trabajo por fases en Jarvis. Usar con `/fase N` para empezar la fase N (entrevista → plan → confirmación → implementación) o `/fase cerrar N` para cerrarla y escribir su resumen.
argument-hint: "N | cerrar N"
---

# /fase — trabajo por fases en Jarvis

Argumentos: `N` (empezar la fase N) o `cerrar N` (cerrar la fase N).

## Empezar una fase (`/fase N`)

1. **Contexto mínimo.** Lee solo:
   - La sección de la fase N en `docs/PLAN.md` (alcance y "terminada cuando…") y las decisiones pendientes que le afecten.
   - `docs/fases/fase-(N-1).md` si existe. No leas fases anteriores ni el código salvo que haga falta para una pregunta concreta.
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
4. **Implementación.** Tarea a tarea:
   - Implementa, verifica con `pnpm -r typecheck` y los tests afectados, y muestra solo errores.
   - Al terminar cada tarea, márcala en el plan y dime en 2-3 líneas qué has hecho y el porqué de lo importante.
   - Si una tarea crece o aparece algo no acordado, para y pregunta.

## Cerrar una fase (`/fase cerrar N`)

1. Comprueba el criterio de terminado del plan y ejecuta typecheck, tests y lint. Si algo falla, dímelo antes de cerrar.
2. Escribe `docs/fases/fase-N.md` (máximo ~1 página), pensado para que la siguiente sesión empiece solo con él:
   - Qué se ha construido (módulos, endpoints, tablas) y dónde está.
   - Decisiones tomadas y su porqué.
   - Comandos nuevos o cambios en `CLAUDE.md`.
   - Pendientes y deuda técnica conocida.
   - Conceptos de backend aprendidos en la fase, en una lista breve.
3. Actualiza la sección de comandos de `CLAUDE.md` si han cambiado, y el `CLAUDE.md` de cada app tocada si han aparecido convenciones o patrones nuevos (o crea el de una app nueva). Comprueba que `docs/dominio.md` refleja lo construido.
4. Propón el mensaje de commit y recuérdame hacer `/clear` antes de la siguiente fase.

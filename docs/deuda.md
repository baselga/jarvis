# Deuda técnica y mejoras

Lo que se deja para más adelante a sabiendas. Cada entrada: qué pasa, por qué importa y de dónde sale. Cuando se resuelva, se borra (queda en git). `/jarvis-phase` la revisa al empezar una fase para decidir qué entra.

## Deuda

- **La imagen `prod` no aplica migraciones ni ejecuta el seed.** Hoy solo lo hace `dev` al arrancar. Resolver al desplegar. _(tareas 1 y 4)_
- **Sin límite de intentos de login.** Fuerza bruta posible contra `/auth/login`; `@fastify/rate-limit`. _(tarea 5)_
- **Si la BD cae, las rutas protegidas dan 500, no 503.** Falta un `setErrorHandler` global que traduzca los fallos de conexión. _(tarea 6)_
- **CRUD repetido en `authors`, `genres` y `sagas`** (~250 líneas casi iguales). Extraer uno genérico cuando llegue una cuarta entidad «solo nombre». _(tarea 10)_
- **La búsqueda distingue tildes** («garcia» no encuentra «García»). Necesita la extensión `unaccent` y afecta a los cuatro listados. _(tarea 12)_

## Mejoras posibles

- **No hay `PATCH /auth/me`:** un adulto no puede editar su propio nombre. _(tarea 7)_
- **Emails normalizados solo por Zod** (`EmailSchema`); la BD garantiza que sean únicos, no que estén en minúsculas. Un `check (email = lower(email))` lo cerraría. _(tarea 5)_
- **Imports de `@jarvis/schemas` sin ordenar** en los módulos de la biblioteca (gusto; una regla de ESLint lo resolvería en todo el monorepo). _(tarea 10)_

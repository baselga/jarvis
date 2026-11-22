# Deuda técnica y mejoras

Lo que se deja para más adelante a sabiendas. Cada entrada: qué pasa, por qué importa y de dónde sale. Cuando se resuelva, se borra (queda en git). `/jarvis-phase` la revisa al empezar una fase para decidir qué entra.

## Deuda

- **La imagen `prod` no aplica migraciones ni ejecuta el seed.** Hoy solo lo hace `dev` al arrancar. Resolver al desplegar, en la fase 4. _(tareas 1 y 4)_
- **Arranque sin BD:** si Postgres no está listo cuando arranca la API (`server.ts`, migraciones), no se reintenta. Hay que verlo al desplegar, en la fase 4, junto con la entrada de la imagen `prod`. _(tarea 16)_
- **Sin límite de intentos de login.** Fuerza bruta posible contra `/auth/login`; `@fastify/rate-limit`. Fase 4, al exponer la API fuera de casa. _(tarea 5)_
- **CRUD repetido en `authors`, `genres` y `sagas`** (~250 líneas casi iguales). Extraer uno genérico cuando llegue una cuarta entidad «solo nombre». _(tarea 10)_

## Mejoras posibles

- **Búsqueda sin índice:** `unaccent(col) ILIKE …` recorre la tabla entera, porque `unaccent` no es `IMMUTABLE` y no se puede indexar. Con unos cientos de libros no se nota. Si la biblioteca crece mucho: un wrapper `IMMUTABLE` de `unaccent` + índice `pg_trgm` sobre él. _(tarea 18)_
- **No se pueden corregir ni borrar préstamos:** un error al registrar el prestatario o las fechas no tiene arreglo desde la API (solo en la BD). Haría falta `PATCH`/`DELETE /loans/:id` con sus reglas. _(tarea 13)_
- **Sin fecha por defecto en préstamos ni lecturas:** `loanedAt`/`returnedAt` son obligatorios y en las lecturas la API tampoco rellena «hoy», porque calcularlo exige la zona horaria de casa (`CURRENT_DATE` va en la del servidor, normalmente UTC). Si el asistente necesita «préstalo hoy» o «empecé a leerlo hoy», hay que decidir dónde se calcula. _(tareas 13 y 14)_

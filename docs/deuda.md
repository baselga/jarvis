# Deuda técnica y mejoras

Lo que se deja para más adelante a sabiendas. Cada entrada: qué pasa, por qué importa y de dónde sale. Cuando se resuelva, se borra (queda en git). `/jarvis-phase` la revisa al empezar una fase para decidir qué entra.

## Deuda

- **La imagen `prod` no aplica migraciones ni ejecuta el seed.** Hoy solo lo hace `dev` al arrancar. Resolver al desplegar, en la fase 4. _(tareas 1 y 4)_
- **Arranque sin BD:** si Postgres no está listo cuando arranca la API (`server.ts`, migraciones), no se reintenta. Hay que verlo al desplegar, en la fase 4, junto con la entrada de la imagen `prod`. _(tarea 16)_
- **Sin límite de intentos de login.** Fuerza bruta posible contra `/auth/login`; `@fastify/rate-limit`. Fase 4, al exponer la API fuera de casa. _(tarea 5)_
- **CRUD repetido en `authors`, `genres` y `sagas`** (~250 líneas casi iguales). Extraer uno genérico cuando llegue una cuarta entidad «solo nombre». _(tarea 10)_

## Mejoras posibles

- **Búsqueda sin índice:** `unaccent(col) ILIKE …` recorre la tabla entera, porque `unaccent` no es `IMMUTABLE` y no se puede indexar. Con unos cientos de libros no se nota. Si la biblioteca crece mucho: un wrapper `IMMUTABLE` de `unaccent` + índice `pg_trgm` sobre él. _(tarea 18)_
- **OpenAPI con cuerpo opcional marcado como obligatorio:** en `POST /loans/{id}/return` y `POST /books/{id}/readings` el cuerpo es opcional (`.nullish()`), pero `/docs/json` dice `requestBody.required: true` (`@fastify/swagger` lo fija siempre que hay `schema.body`). Solo es documentación: el cliente tipado usa `@jarvis/schemas`. Si algún cliente se genera desde el OpenAPI, un `transformObject` en `registerOpenApi` que ponga `required: false` cuando el esquema es `nullable`. _(tarea 21)_

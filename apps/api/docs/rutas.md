# Rutas: esquemas, validación y errores

Léela si tocas el `schema` de una ruta, lo que acepta o devuelve, OpenAPI o los códigos HTTP. Las reglas básicas de toda ruta (plugin, `schema` completo, rutas protegidas) están en `../CLAUDE.md`.

- **Se valida también la respuesta:** las claves que no estén en el esquema se eliminan en silencio (no se filtran, p. ej. `passwordHash`); si falta un campo o no encaja su tipo, 500. Si un `return` convive con `reply.send(...)`, usa `as const` en el literal para que TS no ensanche los enums.
- **Cuerpos estrictos:** por defecto Zod quita en silencio las claves desconocidas. Si ignorar una haría creer al cliente que se aplicó (p. ej. `role` al editarse a sí mismo), `z.strictObject` → 400. Ver `UpdateMeRequestSchema` (`packages/schemas/src/auth.ts`).
- **Cuerpo vacío:** `buildApp` sustituye el parser de JSON: un cuerpo vacío con `Content-Type: application/json` llega como `undefined` (no 400). Así funcionan los POST sin cuerpo, como logout. Si la ruta tiene `body` en el `schema` y el cuerpo es opcional, el esquema termina en `.nullish()`, no `.optional()`: Fastify valida un cuerpo ausente como `null` (con o sin `Content-Type`). Ver `ReturnLoanRequestSchema`.
- **Documentación:** Swagger UI en `/docs`, documento OpenAPI en `/docs/json`, generados desde los esquemas Zod.
- **Códigos HTTP con intención:** 503 si falla una dependencia (BD), no 500. El 503 por BD caída y el 500 genérico («Error interno», sin el SQL de Drizzle; el detalle va al log) los pone el manejador global: las rutas no capturan errores de conexión ni declaran el 503 (lo documenta `openapi.ts`). Solo `/health` tiene el suyo.

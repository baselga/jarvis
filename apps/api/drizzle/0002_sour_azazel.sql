-- Normaliza antes de añadir el CHECK: Postgres lo valida contra las filas existentes y
-- fallaría si alguna tuviera mayúsculas. Va en la misma transacción: se aplica todo o nada.
-- Si dos emails solo difieren en mayúsculas, el `unique` hace fallar la migración (a propósito:
-- no se fusionan usuarios a ciegas).
UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"));

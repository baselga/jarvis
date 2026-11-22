-- unaccent quita tildes y diacríticos ('García' → 'Garcia'). Viene con Postgres (contrib)
-- y es «trusted»: no exige superusuario para instalarla.
CREATE EXTENSION IF NOT EXISTS unaccent;

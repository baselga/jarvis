# Dominio del hogar

Glosario de quién vive en casa, qué datos guarda Jarvis y qué reglas se aplican. En lenguaje de casa; el detalle técnico está en el código y en `/docs` de la API.

## Miembros y roles

- **admin** (`admin`) — Daniel. Puede todo, incluida la gestión de usuarios.
- **adulto** (`adult`) — su mujer. Gestiona todos los datos del hogar, pero no los usuarios.
- **invitado** (`guest`) — cualquier otra persona. Una única cuenta compartida. Solo consulta.

No hay registro: el primer admin se crea al instalar y él da de alta al resto. Un usuario no se borra, se **desactiva** (no puede entrar y se cierran sus sesiones, pero se conserva su historial).

| Acción | admin | adulto | invitado |
|---|---|---|---|
| Ver libros, autores, géneros, sagas y préstamos | ✅ | ✅ | ✅ |
| Crear, editar y borrar esos datos | ✅ | ✅ | ❌ |
| Ver lecturas de la casa | ✅ | ✅ | ❌ |
| Registrar, editar y borrar **sus** lecturas | ✅ | ✅ | ❌ |
| Editar o borrar lecturas de otro | ❌ | ❌ | ❌ |
| Cambiar su propia contraseña | ✅ | ✅ | ❌ |
| Gestionar usuarios | ✅ | ❌ | ❌ |

## Biblioteca

- **Libro** — un ejemplar de casa. Título (obligatorio), autores, géneros, saga y su orden en ella, ISBN, año, idioma, ubicación ("salón, estantería 2") y notas; todo salvo el título es opcional.
- **Autor** — nombre. Un libro puede tener varios autores y un autor varios libros.
- **Género** — nombre ("Ciencia ficción", "Ensayo"…). Lista controlada que se edita desde la web; un libro puede tener varios.
- **Saga** — nombre ("Fundación"). Un libro pertenece como mucho a una, con un orden de lectura que admite decimales (2.5 para un relato intermedio). Puede haber dos libros con el mismo orden (p. ej. una edición ómnibus).
- **Préstamo** — un libro dejado a alguien (texto libre, normalmente alguien sin cuenta), con fecha de préstamo y de devolución. Un libro está **prestado** si tiene un préstamo sin devolver; no se puede prestar dos veces a la vez.
- **Lectura** — que un miembro ha leído un libro: fecha de inicio (opcional), fecha de fin, valoración de 1 a 5 y nota (opcionales). Se puede releer un libro, así que puede haber varias lecturas del mismo libro por persona.

Reglas:

- No se puede borrar un autor, género o saga que tenga libros.
- Borrar un libro borra también sus préstamos y lecturas.

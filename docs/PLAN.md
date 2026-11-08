# Jarvis — Objetivos, arquitectura y fases

Nov 7, 2026 · Daniel

Jarvis es un asistente virtual tipo Alexa, conectado a una IA, que conoce los datos de nuestra casa (biblioteca, lista de la compra, tareas, recetas) y recuerda las conversaciones con cada miembro de la familia. Se aloja en un servidor propio en casa.

Es un **proyecto personal**: el criterio para tomar decisiones es que funcione bien para nuestra casa y que sirva para aprender desarrollo backend con TypeScript, no que escale ni que sea comercializable.

## Forma de trabajo

Este documento es el punto de partida del proyecto. Antes de empezar cada fase, el asistente que me ayude a desarrollarlo debe **entrevistarme** para definir exactamente qué hay que hacer:

1. Repasar el alcance de la fase en este documento y lo ya construido en las fases anteriores.
2. Hacerme preguntas, pocas a la vez, sobre lo que no esté claro: funcionalidades concretas, datos, casos de uso, prioridades y decisiones técnicas abiertas.
3. Resumir lo acordado (tareas, decisiones y criterio de terminado) y esperar a que lo confirme.
4. Solo entonces empezar a implementar.

Como el objetivo también es aprender backend, al implementar debe explicarme el porqué de las decisiones importantes.

## Objetivos

1. **Centralizar los datos del hogar** en una API REST propia: catálogo de libros, lista de la compra, tareas de la casa, recetas y lo que vaya surgiendo.
2. **Hablar con un asistente con IA** que consulte y modifique esos datos en lenguaje natural ("añade leche a la lista", "¿tenemos algún libro de Asimov?").
3. **Distinguir a los usuarios**: yo, mi mujer y el resto (invitados), cada uno con sus permisos y su propia memoria de conversaciones.
4. **Recordar conversaciones** con cada usuario para dar respuestas con contexto.
5. **Acceder por chat web** con login, y más adelante **por voz** desde un dispositivo en casa.
6. **Gestionar los datos desde una web** (alta, edición y borrado sin pasar por el asistente).
7. **Alojarlo todo en un servidor propio** en casa.
8. **Aprender desarrollo backend con TypeScript**: diseño de APIs, bases de datos, autenticación, integración con LLMs y despliegue con Docker.

### Fuera de alcance

- Multi-hogar, registro abierto de usuarios, facturación o cualquier aspecto de producto comercial.
- Alta disponibilidad o escalado: basta con que funcione bien para una familia.
- Ejecutar modelos de IA grandes en local; el LLM se usa por API.

## Arquitectura inicial

El asistente es un servicio independiente del canal: la web y el dispositivo de voz son clientes que le hablan, y él usa la API del hogar como herramientas, igual que lo haría cualquier otro cliente.

&#91;embedded content: arquitectura inicial · 6 piezas\]

La web habla con la API para gestionar datos y con el asistente para chatear; el asistente llama a la API con el token del usuario, así que los permisos se aplican también a lo que pide la IA.

### Componentes

| Componente | Responsabilidad |
| --- | --- |
| `apps/api` — API hogar | Dueña de los datos (libros, compra, tareas, recetas…) y de los usuarios, la autenticación y los roles (`admin`, `adulto`, `invitado`). API REST documentada con OpenAPI. No sabe nada de IA. |
| `apps/assistant` — Asistente | Recibe `{ usuario, canal, texto }`, recupera la memoria del usuario, llama al LLM y ejecuta herramientas que son llamadas a la API hogar **con el token del usuario**, para que se respeten sus permisos. Guarda las conversaciones. |
| `apps/web` — Web app | Una sola app con dos secciones: `/chat` (hablar con el asistente) y `/gestion` (CRUD de los datos). Un único login. |
| `voice/` — Satélite de voz | Fase final. Palabra de activación, voz a texto y texto a voz. Para el asistente es un cliente más; además resuelve quién está hablando. |
| PostgreSQL | Datos del hogar y conversaciones. Más adelante, pgvector para búsqueda semántica en la memoria. |
| LLM externo | Modelo por API (Claude, OpenAI…), intercambiable. |

### Stack

| Capa | Elección |
| --- | --- |
| Monorepo | pnpm workspaces (Turborepo si crece) |
| Backend | Node + Fastify + Zod |
| ORM | Drizzle |
| Base de datos | PostgreSQL |
| IA | Vercel AI SDK (tool calling, streaming, cambio de proveedor) |
| Front | React + Vite + TanStack Query |
| Tipos compartidos | Esquemas Zod en un paquete común |
| Infra | Docker Compose + Caddy (proxy inverso con HTTPS) |
| Voz | Python: openWakeWord, Whisper, Piper (o el pipeline de Home Assistant) |

### Estructura del repositorio

```
jarvis/
├── apps/
│   ├── api/          # API hogar (Fastify + Drizzle)
│   ├── assistant/    # Cerebro: LLM, memoria, herramientas
│   └── web/          # React: chat + gestión
├── packages/
│   ├── schemas/      # Zod: entidades y DTOs compartidos
│   └── api-client/   # Cliente tipado de la API
├── voice/            # (futuro) satélite en Python
└── docker-compose.yml
```

Todo se desarrolla con Docker Compose desde el primer día, para que el despliegue en el servidor (aún por elegir) sea copiar y arrancar.

## Fases

El proyecto avanza en siete fases; cada una deja algo usable en casa, y la parte más arriesgada (la voz) llega cuando el resto ya funciona.

| Fase | Alcance | Terminada cuando… |
| --- | --- | --- |
| 0. Esqueleto | Monorepo con pnpm, configuración TypeScript compartida, Docker Compose con PostgreSQL, API mínima con endpoint de salud. | `docker compose up` levanta la API y la base de datos, y `/health` responde. |
| 1. API hogar y gestión | Modelo de datos (usuarios y roles, libros, compra, tareas, recetas), autenticación, CRUD con OpenAPI, sección `/gestion` de la web. | Puedo iniciar sesión y gestionar todos los datos desde la web. |
| 2. Asistente por chat | Servicio `assistant`, LLM con tool calling sobre la API, sección `/chat` con respuestas en streaming. | "Añade leche a la lista de la compra" desde el chat aparece en la lista, y un invitado no puede borrar datos. |
| 3. Despliegue en casa | Elegir el servidor, Caddy, acceso remoto seguro (Tailscale o Cloudflare Tunnel), copias de seguridad automáticas de la base de datos. | Uso el asistente desde el móvil fuera de casa y hay backups diarios. |
| 4. Memoria | Guardar conversaciones por usuario, resumirlas en hechos persistentes y pasárselos al modelo; pgvector si hace falta. | El asistente recuerda algo de una conversación anterior y no mezcla lo de un usuario con otro. |
| 5. Voz | Dispositivo en casa (Raspberry Pi o ESP32-S3), palabra de activación, voz a texto y texto a voz. El usuario se identifica diciendo quién es. | Le pregunto algo en voz alta y responde hablando. |
| 6. Reconocimiento de hablante | Distinguir automáticamente mi voz y la de mi mujer; el resto se trata como invitado. | Nos reconoce en la mayoría de los casos y, si duda, pregunta. |

## Decisiones pendientes y riesgos

- [ ] Elegir el hardware del servidor (cuando haya algo que desplegar, en la fase 3).
- [ ] Elegir el proveedor de LLM y fijar un límite de gasto mensual en su API.
- [ ] Elegir el hardware del dispositivo de voz (fase 5).

Riesgos principales:

- **Reconocer quién habla por voz** es la pieza menos fiable. Mitigación: empezar con identificación explícita ("soy Daniel") y tratar el reconocimiento automático como mejora.
- **La parte de voz es mayoritariamente Python**, no TypeScript. Se aísla en `voice/` y habla con el asistente por HTTP o WebSocket.
- **Pérdida de datos** en un servidor doméstico. Mitigación: backups automáticos fuera del servidor desde la fase 3.
- **Exponer el servidor a internet.** Mitigación: acceso remoto mediante Tailscale o Cloudflare Tunnel, sin abrir puertos en el router.

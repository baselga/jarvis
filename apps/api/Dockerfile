# Se construye desde la raíz del monorepo (contexto "."), porque la API
# necesita el lockfile y los paquetes de `packages/`.

# ---------- base: Node + pnpm ----------
FROM node:24-alpine AS base
# Corepack instala la versión exacta de pnpm del campo `packageManager`.
RUN corepack enable
WORKDIR /app

# ---------- deps: dependencias de todo el workspace ----------
FROM base AS deps
# Primero solo los manifiestos: mientras no cambien, Docker reutiliza la capa
# del `pnpm install` aunque cambie el código.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/schemas/package.json packages/schemas/
RUN pnpm install --frozen-lockfile

# ---------- dev: el código llega montado como volumen ----------
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 3000
CMD ["pnpm", "--filter", "@jarvis/api", "dev"]

# ---------- build: compila schemas y api ----------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/schemas packages/schemas
COPY apps/api apps/api
RUN pnpm --filter @jarvis/schemas build && pnpm --filter @jarvis/api build
# Carpeta autónoma con la API compilada y solo sus dependencias de producción.
# `--legacy`: el modo nuevo exige `injectWorkspacePackages`, que en desarrollo
# copiaría `schemas` en vez de enlazarlo.
RUN pnpm --filter @jarvis/api deploy --prod --legacy /out

# ---------- prod: imagen final mínima ----------
FROM node:24-alpine AS prod
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]

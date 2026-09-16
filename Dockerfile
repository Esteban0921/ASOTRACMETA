# Imagen de producción (TASK-0032, spec §18): un proceso Node sirve la API y el build de la web.
# Build reproducible desde el lockfile; el runtime solo lleva las dependencias de producción de la API.

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
# Dependencias de producción de la API, resueltas por pnpm (workspace incluido).
RUN pnpm --filter @asotracmet/api --prod deploy /out/api

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    PERSISTENCIA=postgres \
    WEB_DIR=/app/web \
    MIGRACIONES_DIR=/app/migrations
WORKDIR /app
COPY --from=build /out/api/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/web/dist ./web
COPY --from=build /repo/dist/scripts ./scripts
COPY --from=build /repo/infra/postgres/migrations ./migrations
RUN mkdir -p /app && chown -R node:node /app
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/healthz || exit 1
# `node scripts/migrate-db.mjs` aplica las migraciones pendientes antes de arrancar (append-only, RULE-025).
CMD ["sh", "-c", "if [ \"$PERSISTENCIA\" = postgres ]; then node scripts/migrate-db.mjs; fi && exec node dist/index.mjs"]

FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack prepare pnpm@11.25.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @puvo/api... --network-concurrency 4 --fetch-timeout 600000

FROM deps AS builder
WORKDIR /app
COPY . .
RUN pnpm --filter @puvo/api build

FROM builder AS pruner
RUN pnpm --filter @puvo/api deploy --prod /out

FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=pruner /out ./
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/migrations ./apps/api/migrations
COPY --from=builder /app/apps/api/scripts ./apps/api/scripts
RUN ln -s src/main.js dist/main.js
EXPOSE 4000
CMD ["node", "dist/src/main.js"]


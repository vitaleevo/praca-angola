# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack prepare pnpm@11.25.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN --mount=type=cache,id=puvo-admin-pnpm-store,target=/pnpm/store/v11,sharing=locked \
  pnpm install --frozen-lockfile --filter @puvo/admin... --network-concurrency 4 --fetch-timeout 600000

FROM deps AS builder
WORKDIR /app
ENV API_INTERNAL_URL=http://api:4000/api/v1
COPY . .
RUN pnpm --filter @puvo/admin build

FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/apps/admin/.next/standalone ./
COPY --from=builder /app/apps/admin/.next/static ./apps/admin/.next/static
EXPOSE 3000
CMD ["node", "apps/admin/server.js"]

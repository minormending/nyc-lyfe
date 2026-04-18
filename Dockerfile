# syntax=docker/dockerfile:1.7
#
# Multi-stage build: Vite bundles the game into static files, then Caddy
# serves them. The gateway Caddy handles TLS, prefix stripping, and security
# headers — this image only serves /srv on port 80.

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS builder
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY index.html vite.config.js ./
COPY js/ js/
COPY css/ css/
COPY public/ public/
RUN pnpm build

FROM caddy:2.8-alpine AS runtime
COPY --from=builder /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --spider -q -T 3 http://127.0.0.1/ || exit 1

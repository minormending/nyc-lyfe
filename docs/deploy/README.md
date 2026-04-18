# Build, CI/CD, and Deployment

This document explains how the game is built, tested, and deployed to production. Read this before modifying the build pipeline or deployment infrastructure.

---

## Table of Contents

- [Local Development](#local-development)
- [Build Process](#build-process)
- [CI Pipeline](#ci-pipeline)
- [Docker Build](#docker-build)
- [Caddy Web Server](#caddy-web-server)
- [Deployment Pipeline](#deployment-pipeline)
- [Production Infrastructure](#production-infrastructure)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [Capacitor (Future Native Builds)](#capacitor-future-native-builds)

---

## Local Development

### Prerequisites

- **Node.js 22+** (the Dockerfile uses `node:22-slim`)
- **pnpm 9.12.3+** (specified in `package.json` `packageManager` field)

### Starting the Dev Server

```bash
pnpm install         # install dependencies (first time only)
pnpm dev             # starts Vite dev server
```

Vite serves on `http://localhost:5173` by default. It provides:
- Hot Module Replacement (HMR) for JS and CSS changes
- Automatic browser refresh
- Fast startup (no full build needed)

### Previewing a Production Build

```bash
pnpm build           # create production bundle in dist/
pnpm preview         # serve the dist/ folder locally
```

This is useful to verify the production build works before deploying.

---

## Build Process

The build uses **Vite 6** (`vite.config.js`):

```js
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH || '/';
  return {
    base,
    build: {
      outDir: 'dist',
    },
  };
});
```

### What Vite Does

1. **Bundles JS** - All ES modules in `js/` are bundled into optimized chunks
2. **Processes CSS** - All CSS files are bundled and minified
3. **Copies public/** - Everything in `public/` is copied verbatim to `dist/`
4. **Processes index.html** - Asset references are updated with hashed filenames

### Output Structure

```
dist/
├── index.html          (processed with updated asset refs)
├── assets/
│   ├── index-[hash].js (bundled JS)
│   └── index-[hash].css (bundled CSS)
├── data/               (copied from public/data/)
│   ├── classes.json
│   ├── neighborhoods.json
│   └── ... etc
└── assets/             (copied from public/assets/)
    ├── bg/
    ├── portraits/
    └── ui/
```

### Base Path

The `VITE_BASE_PATH` environment variable controls the base URL for all asset references. This is critical for subpath deployment:

- **Local dev:** Not set → defaults to `/`
- **Production:** Set to `/nyc-lyfe/` → all paths become `/nyc-lyfe/assets/...`

This is set in the Docker build args and the deploy workflow.

---

## CI Pipeline

**File:** `.github/workflows/ci.yml`

Runs on every push to `main` and every pull request.

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.3
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

**What it checks:**
- Dependencies install successfully with locked versions
- The Vite build succeeds (catches syntax errors, import issues, etc.)

**What it does NOT check:**
- No tests (there are none)
- No linting
- No type checking (no TypeScript)

**If CI fails:** The build broke. Check the build log for the error. Common causes:
- Import path typo
- Syntax error in JS
- Missing dependency

---

## Docker Build

**File:** `Dockerfile`

Multi-stage build with two stages:

### Stage 1: Builder (Node.js)

```dockerfile
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS builder
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY index.html vite.config.js ./
COPY js/ js/
COPY css/ css/
COPY public/ public/
RUN pnpm build
```

This stage:
1. Installs pnpm via corepack
2. Installs dependencies from the lockfile
3. Copies source files
4. Runs `pnpm build` to create the `dist/` folder
5. Uses Docker layer caching for `pnpm install` (mount cache)

### Stage 2: Runtime (Caddy)

```dockerfile
FROM caddy:2.8-alpine AS runtime
COPY --from=builder /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --spider -q -T 3 http://127.0.0.1/ || exit 1
```

This stage:
1. Uses the lightweight Caddy Alpine image
2. Copies the built `dist/` folder to `/srv`
3. Copies the Caddyfile for server configuration
4. Exposes port 80
5. Adds a health check (HTTP GET every 30 seconds)

The final image is ~40MB and contains only Caddy + static files. No Node.js in production.

### Building Locally

```bash
docker build -t nyc-lyfe --build-arg VITE_BASE_PATH=/nyc-lyfe/ .
docker run -p 8080:80 nyc-lyfe
# Open http://localhost:8080
```

---

## Caddy Web Server

**File:** `Caddyfile`

```
:80 {
    encode zstd gzip
    root * /srv
    try_files {path} /index.html
    file_server
}
```

### What This Does

- **`:80`** - Listens on port 80 (TLS is handled by the gateway Caddy, not this container)
- **`encode zstd gzip`** - Compresses responses with zstd or gzip
- **`root * /srv`** - Serves files from `/srv` (where dist/ was copied)
- **`try_files {path} /index.html`** - SPA routing: if a file doesn't exist, serve `index.html`
- **`file_server`** - Standard static file serving

### Why SPA Routing?

The `try_files` directive ensures that any path that doesn't match a real file falls back to `index.html`. This is important because:
- The game is a single-page app
- If someone refreshes on a deep path, they should get the app, not a 404
- In practice, the game doesn't use URL routing, but this is a safety net

---

## Deployment Pipeline

**File:** `.github/workflows/deploy.yml`

Triggers on push to `main` or manual dispatch. Two jobs:

### Job 1: build-push

1. **Checkout** the repository
2. **Build Docker image** with `VITE_BASE_PATH=/nyc-lyfe/`
3. **Push to GHCR** (GitHub Container Registry) with two tags:
   - `ghcr.io/[owner]/[repo]/web:[commit-sha]` (immutable)
   - `ghcr.io/[owner]/[repo]/web:latest` (rolling)
4. **Scan with Trivy** for HIGH/CRITICAL vulnerabilities
5. **Upload SARIF** results to GitHub Security tab

### Job 2: deploy

Depends on `build-push` completing successfully.

1. **Copy** `deploy/nyc-lyfe/docker-compose.yml` to the droplet via SCP
2. **SSH** into the droplet and:
   - Create a temporary Docker config (for GHCR login)
   - Login to GHCR with a read token
   - Write `.env` file with `GH_REPO` and `IMAGE_TAG`
   - `docker compose pull` the new image
   - `docker compose up -d --remove-orphans` to restart
   - Clean up old images

### Required Secrets

| Secret | Purpose |
|--------|---------|
| `DROPLET_HOST` | DigitalOcean droplet IP/hostname |
| `DROPLET_USER` | SSH user (typically `deploy`) |
| `DROPLET_SSH_KEY` | SSH private key for authentication |
| `GHCR_READ_TOKEN` | GitHub token with `packages:read` for pulling images |

### Concurrency

```yaml
concurrency:
  group: deploy-prod
  cancel-in-progress: false
```

Only one deployment can run at a time. If a second push happens while deploying, it waits for the first to finish.

---

## Production Infrastructure

```
Internet
  │
  ├── DNS → DigitalOcean Droplet
  │
  ├── Gateway Caddy (shared, handles TLS + routing)
  │   └── /nyc-lyfe/* → nyc-lyfe-web container (port 80)
  │
  └── nyc-lyfe-web container
      └── Caddy → /srv (static files)
```

### Docker Compose

**File:** `deploy/nyc-lyfe/docker-compose.yml`

```yaml
services:
  nyc-lyfe-web:
    image: ghcr.io/${GH_REPO}/web:${IMAGE_TAG}
    container_name: nyc-lyfe-web
    restart: unless-stopped
    networks:
      - gateway
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    read_only: true
    tmpfs:
      - /tmp
      - /config
      - /data
    deploy:
      resources:
        limits:
          cpus: "0.25"
          memory: 64M

networks:
  gateway:
    name: gateway_nyc
    external: true
```

### Security Hardening

- **`no-new-privileges`**: Container processes cannot gain new privileges
- **`cap_drop: ALL`**: All Linux capabilities dropped
- **`cap_add: NET_BIND_SERVICE`**: Only permission: bind to port 80
- **`read_only: true`**: Filesystem is read-only (tmpfs for writable dirs)
- **Resource limits**: 0.25 CPU, 64MB RAM (this is a static file server)

### Networking

The container does NOT bind to a host port. It connects to the `gateway_nyc` Docker network, and the shared gateway Caddy reverse-proxies to it by container name.

---

## Environment Variables

### Build Time

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_BASE_PATH` | `/` | Base URL path for all asset references |

Set in Docker build args:
```bash
docker build --build-arg VITE_BASE_PATH=/nyc-lyfe/ .
```

### Runtime

| Variable | Required | Purpose |
|----------|----------|---------|
| `GH_REPO` | Yes | GitHub repository path (lowercase) |
| `IMAGE_TAG` | Yes | Docker image tag (commit SHA) |

Set in the `.env` file on the droplet by the deploy script.

---

## Troubleshooting

### Build fails locally

```bash
# Clear node_modules and reinstall
rm -rf node_modules
pnpm install

# Check Node version
node --version   # should be 22+

# Check pnpm version
pnpm --version   # should be 9.12.3+
```

### Docker build fails

```bash
# Build with verbose output
docker build --progress=plain -t nyc-lyfe .

# Check if the issue is in the Vite build stage
docker build --target builder -t nyc-lyfe-builder .
```

### Deployment fails

1. Check GitHub Actions logs for the specific error
2. Common issues:
   - SSH key mismatch → re-add `DROPLET_SSH_KEY` secret
   - GHCR token expired → regenerate `GHCR_READ_TOKEN`
   - Disk full on droplet → SSH in and run `docker system prune`
   - Gateway network missing → `docker network create gateway_nyc`

### Game loads but JSON data is missing

- Check browser DevTools Network tab for 404s on `/data/*.json`
- Verify `VITE_BASE_PATH` matches the deployment path
- Check that `public/data/` files exist and are valid JSON

### Game loads but assets are broken paths

- Check that asset paths use `./assets/...` (relative) not `/assets/...` (absolute)
- The game should gracefully fall back even without assets

---

## Capacitor (Future Native Builds)

**File:** `capacitor.config.json`

```json
{
  "appId": "com.nyclyfe.game",
  "appName": "NYC: Slice of Life",
  "webDir": "dist",
  "server": {
    "androidScheme": "https"
  }
}
```

Capacitor is configured but native platforms are not yet generated. To set up:

```bash
pnpm build                    # build web assets to dist/
npx cap add android           # generate android/ directory
npx cap add ios               # generate ios/ directory
pnpm cap:sync                 # sync web assets to native projects
pnpm cap:android              # open in Android Studio
pnpm cap:ios                  # open in Xcode
```

**Status:** Phase F (Capacitor native builds) is not yet started. The `android/` and `ios/` directories do not exist yet.

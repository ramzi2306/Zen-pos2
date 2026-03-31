# Production Deployment & Dockerization Guide

> **Purpose:** Step-by-step instructions for an AI agent to dockerize the ZEN-POS project — a Vite/React frontend (`Zen-pos2/`) served by a FastAPI backend (`zen-pos-api/`) — into a single production-ready Docker image behind Gunicorn.

---

## Prerequisites

- **Project structure:** Monorepo with two subdirectories:
  - `Zen-pos2/` — Vite + React + TypeScript frontend
  - `zen-pos-api/` — FastAPI + Beanie (MongoDB) backend
- **Tools required on host:** Docker, Docker Compose
- **Build tooling (inside Docker):** Bun (frontend), Python 3.12 (backend)

---

## Step 1 — Add a Bun Build Script to the Frontend

**File:** `Zen-pos2/package.json`

Add a `bun-build` script to the `scripts` section:

```json
"scripts": {
  "dev": "vite --port=3000 --host=0.0.0.0",
  "build": "vite build",
  "bun-build": "bunx --bun vite build",
  "preview": "vite preview",
  "clean": "rm -rf dist",
  "lint": "tsc --noEmit"
}
```

**Why:** The Dockerfile uses a Bun-based image for the frontend build stage. `bunx --bun vite build` runs Vite's build through Bun's runtime for fast production bundling to `dist/`.

---

## Step 2 — Make Frontend API URLs Relative (Same-Origin)

The frontend hardcodes `http://localhost:8000` as the API base. In production, the frontend is served from the **same origin** as the API, so all API calls must use relative URLs.

### 2a. `Zen-pos2/src/api/client.ts`

Change the `API_BASE` fallback from a hardcoded URL to an empty string:

```typescript
// BEFORE
const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

// AFTER
const API_BASE = (import.meta as any).env?.VITE_API_URL || '';
```

### 2b. `Zen-pos2/src/api/websocket.ts`

Change the `wsBase()` function fallback to use `window.location.origin`:

```typescript
// BEFORE
const apiUrl: string =
  (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

// AFTER
const apiUrl: string =
  (import.meta as any).env?.VITE_API_URL || window.location.origin;
```

### 2c. `Zen-pos2/src/views/public/PublicMenuPage.tsx`

Find the WebSocket URL construction in the tracking `useEffect` and apply the same change:

```typescript
// BEFORE
const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

// AFTER
const apiUrl = (import.meta as any).env?.VITE_API_URL || window.location.origin;
```

### 2d. Keep the Local Dev `.env`

Ensure `Zen-pos2/.env` still has this line so local development (with separate frontend/backend servers) keeps working:

```
VITE_API_URL=http://localhost:8000
```

**Why:** In Docker, `VITE_API_URL` is NOT set at build time, so the frontend falls back to relative URLs (same origin). For local dev, the `.env` provides the explicit API URL.

---

## Step 3 — Configure the Backend to Serve Static Files

### 3a. Add Gunicorn to Requirements

**File:** `zen-pos-api/requirements.txt`

Add `gunicorn` to the web framework section:

```
# Web framework
fastapi==0.115.6
uvicorn[standard]==0.32.1
gunicorn==23.0.0
```

### 3b. Update `zen-pos-api/app/main.py`

Add these imports at the top:

```python
import os
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
```

Add a static directory path constant after the logging setup:

```python
# ── Static frontend path ──────────────────────────────────
STATIC_DIR = Path(os.getenv("STATIC_DIR", Path(__file__).resolve().parent.parent / "static"))
```

Add static file serving and SPA fallback **at the very bottom** of the file, after all API router registrations and the `/health` endpoint:

```python
# ── Serve built frontend (production) ─────────────────────
if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        """Serve index.html for any path not matched by API routes (SPA client-side routing)."""
        file = STATIC_DIR / full_path
        if file.is_file():
            return FileResponse(file)
        return FileResponse(STATIC_DIR / "index.html")
```

**Why:**
- The `STATIC_DIR` env var lets Docker set the path explicitly (`/app/static`).
- The `/assets` static mount serves CSS/JS bundles efficiently.
- The catch-all `/{full_path:path}` route returns `index.html` for any unmatched path, enabling client-side SPA routing.
- The `if STATIC_DIR.is_dir()` guard ensures this only activates when a build is present — local dev mode is unaffected.
- **Order matters:** This must be the last route registered so all API prefixes (`/products`, `/orders`, etc.) take priority.

---

## Step 4 — Create the `.dockerignore`

**File:** `.dockerignore` (project root)

```
# Git
.git
.gitignore

# Node
Zen-pos2/node_modules
Zen-pos2/dist

# Python
zen-pos-api/__pycache__
zen-pos-api/.pytest_cache
zen-pos-api/tests

# IDE & OS
.DS_Store
*.log
.claude
.env
```

**Why:** Keeps the Docker build context small and avoids leaking secrets (`.env`).

---

## Step 5 — Create the Multi-Stage Dockerfile

**File:** `Dockerfile` (project root)

```dockerfile
# ────────────────────────────────────────────────────────────
# Stage 1 — Build Vite frontend
# ────────────────────────────────────────────────────────────
FROM oven/bun:1 AS frontend-build

WORKDIR /app/frontend

# Install dependencies first (layer cache)
COPY Zen-pos2/package.json Zen-pos2/bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# Copy source & build
COPY Zen-pos2/ .
RUN bun run build


# ────────────────────────────────────────────────────────────
# Stage 2 — Python backend + serve dist
# ────────────────────────────────────────────────────────────
FROM python:3.12-slim AS production

WORKDIR /app

# Install Python dependencies
COPY zen-pos-api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY zen-pos-api/app ./app

# Copy built frontend from stage 1 into /app/static
COPY --from=frontend-build /app/frontend/dist ./static

# Tell the backend where the static files live
ENV STATIC_DIR=/app/static
ENV APP_ENV=production

EXPOSE 8000

# Run with gunicorn + uvicorn workers
CMD ["gunicorn", "app.main:app", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--workers", "4", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "120"]
```

**Stage 1** uses `oven/bun:1` to install frontend deps and run `bun run build`, producing `dist/`.
**Stage 2** uses `python:3.12-slim`, installs backend deps, copies the backend source and the built frontend, then runs Gunicorn with Uvicorn workers on port 8000.

---

## Step 6 — Create `docker-compose.yml`

**File:** `docker-compose.yml` (project root)

```yaml
services:
  zen-pos:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "6200:8000"
    environment:
      MONGO_URL: mongodb://<user>:<password>@<host>:<port>
      MONGO_DB_NAME: zenpos
      JWT_SECRET: <generate-with-openssl-rand-hex-32>
      JWT_ALGORITHM: HS256
      JWT_ACCESS_EXPIRE_MINUTES: 60
      JWT_REFRESH_EXPIRE_DAYS: 7
      APP_ENV: production
      APP_HOST: 0.0.0.0
      APP_PORT: 8000
      CORS_ORIGINS: http://localhost:8000
      STATIC_DIR: /app/static
```

**Notes:**
- Replace `MONGO_URL` with your actual MongoDB connection string.
- Replace `JWT_SECRET` with output of `openssl rand -hex 32`.
- The `ports` mapping `6200:8000` exposes the app on host port 6200. Adjust as needed.
- If using a local MongoDB container, add a `mongo` service with `image: mongo:7` and set `MONGO_URL: mongodb://mongo:27017`.

---

## Step 7 — Build & Run

```bash
# From the project root:
docker compose up --build
```

The application will be available at `http://localhost:6200` (or whatever host port you mapped).

---

## Environment Variable Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGO_URL` | MongoDB connection string | `mongodb://user:pass@host:27017` |
| `MONGO_DB_NAME` | Database name | `zenpos` |
| `JWT_SECRET` | Token signing secret (use `openssl rand -hex 32`) | `58153621b5fb...` |
| `JWT_ALGORITHM` | JWT algorithm | `HS256` |
| `JWT_ACCESS_EXPIRE_MINUTES` | Access token TTL in minutes | `60` |
| `JWT_REFRESH_EXPIRE_DAYS` | Refresh token TTL in days | `7` |
| `APP_ENV` | Environment label | `production` |
| `APP_HOST` | Bind address | `0.0.0.0` |
| `APP_PORT` | Internal app port | `8000` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:8000` |
| `STATIC_DIR` | Path to built frontend files | `/app/static` |

---

## File Change Summary

| File | Action | Purpose |
|------|--------|---------|
| `Zen-pos2/package.json` | Modified | Added `bun-build` script |
| `Zen-pos2/src/api/client.ts` | Modified | API base → relative URL (`''`) |
| `Zen-pos2/src/api/websocket.ts` | Modified | WS base → `window.location.origin` |
| `Zen-pos2/src/views/public/PublicMenuPage.tsx` | Modified | Tracking WS → `window.location.origin` |
| `zen-pos-api/requirements.txt` | Modified | Added `gunicorn==23.0.0` |
| `zen-pos-api/app/main.py` | Modified | Static file serving + SPA fallback |
| `.dockerignore` | Created | Exclude unnecessary files from build |
| `Dockerfile` | Created | Multi-stage build (Bun → Python) |
| `docker-compose.yml` | Created | Orchestration with env vars |

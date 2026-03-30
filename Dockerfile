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

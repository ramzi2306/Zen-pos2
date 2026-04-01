import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.core.middleware import LoggingMiddleware
from app.database import connect_db, disconnect_db

# ── Routers ───────────────────────────────────────────────
from app.routers import auth, products, orders, attendance, payroll, users, roles, inventory
from app.routers import ingredients, customers, analytics, locations
from app.routers import settings as settings_router
from app.routers import ws as ws_router
from app.routers import public as public_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")

# ── Static frontend path ──────────────────────────────────
STATIC_DIR = Path(os.getenv("STATIC_DIR", Path(__file__).resolve().parent.parent / "static"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await disconnect_db()


app = FastAPI(
    title="ZEN-POS API",
    description="Backend API for the ZEN-POS omakase restaurant management system",
    version="0.1.0",
    lifespan=lifespan,
)

# ── Middleware ─────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(LoggingMiddleware)

# ── Route registration ─────────────────────────────────────
app.include_router(auth.router,       prefix="/auth",       tags=["Auth"])
app.include_router(products.router,   prefix="/products",   tags=["Products"])
app.include_router(orders.router,     prefix="/orders",     tags=["Orders"])
app.include_router(attendance.router, prefix="/attendance", tags=["Attendance"])
app.include_router(payroll.router,    prefix="/payroll",    tags=["Payroll"])
app.include_router(users.router,      prefix="/users",      tags=["Users"])
app.include_router(roles.router,      prefix="/roles",      tags=["Roles"])
app.include_router(inventory.router,    prefix="/inventory",    tags=["Inventory"])
app.include_router(ingredients.router,  prefix="/ingredients",  tags=["Ingredients"])
app.include_router(customers.router,    prefix="/customers",    tags=["Customers"])
app.include_router(analytics.router,    prefix="/analytics",    tags=["Analytics"])
app.include_router(settings_router.router, prefix="/settings",   tags=["Settings"])
app.include_router(locations.router,       prefix="/locations",   tags=["Locations"])
app.include_router(public_router.router,   prefix="/public",      tags=["Storefront"])
app.include_router(ws_router.router,                              tags=["WebSocket"])


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "env": settings.app_env}


# ── Serve built frontend (production) ─────────────────────
if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="frontend-assets")

    # Paths that must never be intercepted and sent to the SPA
    _PASS_THROUGH = ("/assets", "/docs", "/redoc", "/openapi.json", "/ws")

    @app.middleware("http")
    async def spa_browser_fallback(request: Request, call_next):
        """
        Browser page refreshes send Accept: text/html — serve index.html so the
        React SPA can boot and handle client-side routing.
        Fetch / XHR calls from the frontend send Accept: */* and are unaffected.
        """
        accept = request.headers.get("accept", "")
        path = request.url.path
        is_browser_nav = request.method == "GET" and "text/html" in accept
        is_pass_through = any(path.startswith(p) for p in _PASS_THROUGH)
        index = STATIC_DIR / "index.html"

        if is_browser_nav and not is_pass_through and index.is_file():
            return FileResponse(index)

        return await call_next(request)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        """Serve static files or index.html for any unmatched path."""
        file = STATIC_DIR / full_path
        if file.is_file():
            return FileResponse(file)
        return FileResponse(STATIC_DIR / "index.html")

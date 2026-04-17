"""
CAPITALIS V2 - FastAPI Backend
Entry point. Run with:
    uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
"""

import os
import logging
from contextlib import asynccontextmanager
from pathlib import Path

_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path, override=False)
    except ImportError:
        # Parse manually — python-dotenv not installed
        for _line in _env_path.read_text().splitlines():
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _, _v = _line.partition("=")
                os.environ.setdefault(_k.strip(), _v.strip().strip('"\''))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from .routers import macro, portfolio, screener, scorer, equity, ml_predictions, reporting, billing, forex, calendar
from .routers import auth as auth_router
from .routers.settings_router import router as settings_router
from .cache.memory_cache import cache
from .db import init_db

logger = logging.getLogger(__name__)

ENV = os.environ.get("ENV", "development")
API_VERSION = "2.0.0"

ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("CAPITALIS V2 API starting — ENV=%s", ENV)
    yield
    cache.clear()
    logger.info("CAPITALIS V2 API shutdown complete.")


app = FastAPI(
    title="CAPITALIS V2 API",
    version=API_VERSION,
    description="Institutional Quantitative Investment Terminal — REST API",
    # Disable Swagger UI and ReDoc in production to reduce attack surface
    docs_url="/api/docs" if ENV != "production" else None,
    redoc_url="/api/redoc" if ENV != "production" else None,
    openapi_url="/api/openapi.json" if ENV != "production" else None,
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Middleware stack (order matters: outermost = first to run on request)
# ---------------------------------------------------------------------------

# GZip compression for responses > 1KB
app.add_middleware(GZipMiddleware, minimum_size=1024)

# CORS — only allow the configured frontend origin(s)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    max_age=600,
)


# ---------------------------------------------------------------------------
# Security headers middleware
# ---------------------------------------------------------------------------
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if ENV == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# ---------------------------------------------------------------------------
# Global exception handler — never leak stack traces to clients
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"status": "error", "detail": "An internal server error occurred."},
    )


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth_router.router, prefix="/api/auth", tags=["Auth"])
app.include_router(macro.router, prefix="/api/macro", tags=["Macro"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["Portfolio"])
app.include_router(screener.router, prefix="/api/screener", tags=["Screener"])
app.include_router(scorer.router, prefix="/api/scorer", tags=["Scorer"])
app.include_router(equity.router, prefix="/api/equity", tags=["Equity"])
app.include_router(ml_predictions.router, prefix="/api/predictions", tags=["ML Predictions"])
app.include_router(reporting.router, prefix="/api/reporting", tags=["Reporting"])
app.include_router(settings_router, prefix="/api/settings", tags=["Settings"])
app.include_router(billing.router, prefix="/api/billing", tags=["Billing"])
app.include_router(forex.router,     prefix="/api/forex",     tags=["Forex"])
app.include_router(calendar.router,  prefix="/api/calendar",  tags=["Calendar"])


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/api/health", tags=["System"])
def health_check():
    return {"status": "operational", "version": API_VERSION, "environment": ENV}

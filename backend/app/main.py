import logging
from contextlib import asynccontextmanager
from urllib.parse import urlsplit, urlunsplit
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.core.config import get_settings
from app.core.database import engine, Base, SessionLocal, _auto_migrate_sqlite
from app.models import User, AudioAsset, StyleVector, GeneratedMusic, Song  # noqa: F401 — register models
from app.api.v1 import auth, audio, music, models as models_api, voice, song, jobs
from app.api.v1.config import router as config_router
from app.services.auth_service import create_default_user
from app.services.job_service import reconcile_orphaned_runtime_state

_logger = logging.getLogger(__name__)


def _preload_models() -> None:
    """Warm up default AI models at startup so the first upload doesn't pay cold-start cost."""
    import time as _time
    from app.models.providers.registry import get_provider
    from app.models.providers.resource_manager import resource_manager

    models_to_warm = [
        ("vocal_sep", "demucs_htdemucs"),
        ("style_extract", "clap_laion"),
    ]
    for category, key in models_to_warm:
        try:
            _t0 = _time.perf_counter()
            provider = get_provider(key)
            resource_manager.acquire(provider)
            elapsed = _time.perf_counter() - _t0
            _logger.info("MODEL_WARMUP %s=%s loaded in %.2fs (mock=%s)",
                          category, key, elapsed, getattr(provider, '_force_mock', False))
        except Exception as e:
            _logger.warning("MODEL_WARMUP %s=%s failed: %s", category, key, e)

settings = get_settings()

# Apply HF_ENDPOINT to environment for HuggingFace libraries (mirror support for China)
if settings.HF_ENDPOINT:
    import os as _os_main
    _os_main.environ.setdefault("HF_ENDPOINT", settings.HF_ENDPOINT)


def _expand_loopback_origins(origins: list[str]) -> list[str]:
    """Treat localhost/127.0.0.1/::1 as equivalent in local development."""
    expanded: set[str] = set(origins)
    loopback_hosts = {"localhost", "127.0.0.1", "::1", "[::1]"}
    alias_hosts = ("localhost", "127.0.0.1", "[::1]")

    for origin in origins:
        try:
            parsed = urlsplit(origin)
        except Exception:
            continue
        if parsed.hostname not in loopback_hosts:
            continue
        for host in alias_hosts:
            netloc = host
            if parsed.port is not None:
                netloc = f"{host}:{parsed.port}"
            expanded.add(urlunsplit((parsed.scheme, netloc, parsed.path, parsed.query, parsed.fragment)))

    return sorted(expanded)

# Ensure app loggers (app.api.v1.audio, app.tasks.audio_pipeline) output to console
_app_logger = logging.getLogger("app")
if not _app_logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    _app_logger.addHandler(_handler)
    _app_logger.setLevel(logging.INFO)
    _app_logger.propagate = False

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: validate config, migrate DB, seed default user (dev only)."""
    if not settings.SECRET_KEY:
        raise RuntimeError("SECRET_KEY must be set in environment or .env file")

    if not settings.DEBUG:
        # Production security checks
        if not settings.DEFAULT_ADMIN_PASSWORD:
            raise RuntimeError(
                "Production mode requires DEFAULT_ADMIN_PASSWORD. "
                "Set it in .env or environment variable. "
                "The default admin account will NOT be created without this."
            )
        # Disable auto-migrate in production — use Alembic
        logger = logging.getLogger(__name__)
        logger.info("Production mode: auto-migrate disabled, schema managed by Alembic")
    else:
        _auto_migrate_sqlite()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        create_default_user(db)
        recovered = reconcile_orphaned_runtime_state(db)
        if recovered["total"] > 0:
            _logger.info("Recovered stale runtime records at startup: %s", recovered)
    finally:
        db.close()

    # Warm up default models in background — don't block startup
    import threading
    _warmup_thread = threading.Thread(target=_preload_models, daemon=True)
    _warmup_thread.start()
    _logger.info("Model warmup started in background thread")

    yield  # Shutdown happens here (after yield)


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    docs_url="/docs" if settings.DEBUG else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=_expand_loopback_origins(settings.CORS_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routes
app.include_router(auth.router, prefix="/api/v1")
app.include_router(audio.router, prefix="/api/v1")
app.include_router(music.router, prefix="/api/v1")
app.include_router(models_api.router, prefix="/api/v1")
app.include_router(voice.router, prefix="/api/v1")
app.include_router(song.router, prefix="/api/v1")
app.include_router(jobs.router, prefix="/api/v1")
app.include_router(config_router, prefix="/api/v1")


@app.get("/")
def root():
    return {"name": settings.APP_NAME, "version": "0.1.0", "status": "running"}


@app.get("/api/health")
def health():
    return {"status": "healthy"}

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.core.config import get_settings
from app.core.database import engine, Base, SessionLocal
from app.models import User, AudioAsset, StyleVector, GeneratedMusic  # noqa: F401 — register models
from app.api.v1 import auth, audio, music, models as models_api
from app.services.auth_service import create_default_user

settings = get_settings()

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    docs_url="/docs" if settings.DEBUG else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routes
app.include_router(auth.router, prefix="/api/v1")
app.include_router(audio.router, prefix="/api/v1")
app.include_router(music.router, prefix="/api/v1")
app.include_router(models_api.router, prefix="/api/v1")


@app.on_event("startup")
def startup():
    """Create tables and ensure default user exists."""
    if not settings.SECRET_KEY:
        raise RuntimeError("SECRET_KEY must be set in environment or .env file")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        create_default_user(db)
    finally:
        db.close()


@app.get("/")
def root():
    return {"name": settings.APP_NAME, "version": "0.1.0", "status": "running"}


@app.get("/api/health")
def health():
    return {"status": "healthy"}

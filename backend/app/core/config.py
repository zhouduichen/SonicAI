from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "SonicAI"
    DEBUG: bool = True
    SECRET_KEY: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Database — SQLite for dev, swap to PostgreSQL later
    DATABASE_URL: str = "sqlite:///./aimusic.db"

    # Redis (Celery broker)
    REDIS_URL: str = "redis://localhost:6379/0"

    # File storage
    UPLOAD_DIR: str = "./uploads"
    GENERATED_DIR: str = "./generated"

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Hardware tier
    SONICAI_HARDWARE_TIER: str = "ultra"
    SONICAI_PREFERENCE: str = "speed"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()

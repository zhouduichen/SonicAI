"""Hardware tier configuration and service status endpoint."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.model_recommender import (
    get_tier_config,
    HardwareTier,
)

router = APIRouter(prefix="/config", tags=["config"])


# === Service Status ===

class ServiceItem(BaseModel):
    running: bool
    message: str = ""


class ServicesResponse(BaseModel):
    backend: ServiceItem
    redis: ServiceItem
    celery: ServiceItem


def _check_redis() -> tuple[bool, str]:
    try:
        import redis
        from app.core.config import get_settings
        settings = get_settings()
        r = redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        r.ping()
        r.close()
        return True, "connected"
    except ImportError:
        return False, "redis-py not installed"
    except Exception as e:
        return False, str(e)


def _check_celery() -> tuple[bool, str]:
    try:
        from app.tasks.celery_app import celery_app
        insp = celery_app.control.inspect(timeout=2)
        stats = insp.stats()
        if stats:
            worker_count = len(stats)
            return True, f"{worker_count} worker(s) active"
        return False, "no workers responding"
    except ImportError:
        return False, "celery not installed"
    except Exception as e:
        return False, str(e)


@router.get("/services", response_model=ServicesResponse)
def get_services():
    """Return backend, Redis, and Celery worker status."""
    redis_ok, redis_msg = _check_redis()
    celery_ok, celery_msg = _check_celery()
    return ServicesResponse(
        backend=ServiceItem(running=True, message="running"),
        redis=ServiceItem(running=redis_ok, message=redis_msg),
        celery=ServiceItem(running=celery_ok, message=celery_msg),
    )


# === Prompt Provider Status ===

class PromptProviderStatus(BaseModel):
    provider: str
    available: bool
    message: str


class PromptProviderResponse(BaseModel):
    openai: PromptProviderStatus
    ollama: PromptProviderStatus
    active: str


@router.get("/prompt-provider/status", response_model=PromptProviderResponse)
def get_prompt_provider_status():
    """Return current status of OpenAI and Ollama providers for lyrics/prompts."""
    from app.core.config import get_settings
    settings = get_settings()

    openai_available = bool(settings.OPENAI_API_KEY)
    openai_msg = f"model={settings.OPENAI_MODEL} base_url={settings.OPENAI_BASE_URL}" if openai_available else "OPENAI_API_KEY not set"

    ollama_available = False
    ollama_msg = f"host={settings.OLLAMA_HOST}"
    try:
        import httpx
        resp = httpx.get(f"{settings.OLLAMA_HOST}/api/tags", timeout=3)
        if resp.status_code == 200:
            ollama_available = True
            ollama_msg = f"connected, model={settings.OLLAMA_MODEL}"
        else:
            ollama_msg = f"unexpected status {resp.status_code}"
    except Exception as e:
        ollama_msg = f"unreachable: {e}"

    active = "fallback"
    if openai_available:
        active = "openai"
    elif ollama_available:
        active = "ollama"

    return PromptProviderResponse(
        openai=PromptProviderStatus(provider="openai", available=openai_available, message=openai_msg),
        ollama=PromptProviderStatus(provider="ollama", available=ollama_available, message=ollama_msg),
        active=active,
    )


class TierPresetResponse(BaseModel):
    vocal_sep_model: str
    style_extract_model: str
    music_gen_model: str


class TierInfoResponse(BaseModel):
    tier: str
    label_cn: str
    max_vram_gb: float
    speed_preset: TierPresetResponse
    quality_preset: TierPresetResponse
    speed_time_seconds: int
    quality_time_seconds: int


class TierListResponse(BaseModel):
    tiers: list[TierInfoResponse]


@router.get("/tiers", response_model=TierListResponse)
def list_tiers() -> TierListResponse:
    """Return all hardware tier configurations."""
    tiers_list: list[TierInfoResponse] = []
    for t in HardwareTier.__args__:
        cfg = get_tier_config(t)
        tiers_list.append(TierInfoResponse(
            tier=cfg.tier,
            label_cn=cfg.label_cn,
            max_vram_gb=cfg.max_vram_gb,
            speed_preset=TierPresetResponse(
                vocal_sep_model=cfg.speed_preset.vocal_sep_model,
                style_extract_model=cfg.speed_preset.style_extract_model,
                music_gen_model=cfg.speed_preset.music_gen_model,
            ),
            quality_preset=TierPresetResponse(
                vocal_sep_model=cfg.quality_preset.vocal_sep_model,
                style_extract_model=cfg.quality_preset.style_extract_model,
                music_gen_model=cfg.quality_preset.music_gen_model,
            ),
            speed_time_seconds=cfg.speed_time_seconds,
            quality_time_seconds=cfg.quality_time_seconds,
        ))
    return TierListResponse(tiers=tiers_list)

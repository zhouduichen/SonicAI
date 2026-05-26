"""GET /api/v1/models — returns all available AI model options grouped by pipeline stage."""

import logging
from fastapi import APIRouter
from app.models.model_registry import list_models, ModelInfo
from app.schemas.models import ModelCatalogResponse, ModelInfoResponse
from app.models.providers.registry import provider_status
from app.models.providers.svs_provider import get_svs_provider

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/models", tags=["models"])


def _to_response(m: ModelInfo, installed: bool = False) -> ModelInfoResponse:
    # All providers have mock fallbacks — "real" when installed, "mock" otherwise
    provider_mode = "real" if installed else "mock"
    return ModelInfoResponse(
        key=m.key, display_name=m.display_name, description=m.description,
        vram_gb=m.vram_gb, quality=m.quality, speed=m.speed,
        embedding_dim=m.embedding_dim, installed=installed,
        provider_mode=provider_mode,
        pros=m.pros, cons=m.cons,
    )


@router.get("/", response_model=ModelCatalogResponse)
def list_all_models():
    """Return all available AI models grouped by pipeline stage (no auth required)."""
    status = provider_status()
    # Check SVS provider status
    svs_provider = get_svs_provider()
    svs_installed = svs_provider.is_available() if svs_provider else False
    svs_info = ModelInfoResponse(
        key="svs_default",
        display_name=svs_provider.name if svs_provider else "SVS (Mock)",
        description="Singing Voice Synthesis: converts lyrics into sung vocals",
        vram_gb=2.0,
        quality="medium",
        speed="medium",
        installed=svs_installed,
        provider_mode="real" if svs_installed and svs_provider and svs_provider.name != "mock" else "mock",
        pros=["Converts lyrics to singing"] if svs_installed else [],
        cons=["Requires GPU"] if svs_installed else ["Mock provider — no real SVS model"],
    )
    return ModelCatalogResponse(
        vocal_separation=[_to_response(m, installed) for m, installed in status["vocal_separation"]],
        style_extraction=[_to_response(m, installed) for m, installed in status["style_extraction"]],
        music_generation=[_to_response(m, installed) for m, installed in status["music_generation"]],
        svs=[svs_info],
    )

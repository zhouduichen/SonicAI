"""GET /api/v1/models — returns all available AI model options grouped by pipeline stage."""

from fastapi import APIRouter
from app.models.model_registry import list_models, ModelInfo
from app.schemas.models import ModelCatalogResponse, ModelInfoResponse
from app.models.providers.registry import provider_status

router = APIRouter(prefix="/models", tags=["models"])


def _to_response(m: ModelInfo, installed: bool = False) -> ModelInfoResponse:
    return ModelInfoResponse(
        key=m.key, display_name=m.display_name, description=m.description,
        vram_gb=m.vram_gb, quality=m.quality, speed=m.speed,
        embedding_dim=m.embedding_dim, installed=installed,
    )


@router.get("/", response_model=ModelCatalogResponse)
def list_all_models():
    """Return all available AI models grouped by pipeline stage (no auth required)."""
    status = provider_status()
    return ModelCatalogResponse(
        vocal_separation=[_to_response(m, installed) for m, installed in status["vocal_separation"]],
        style_extraction=[_to_response(m, installed) for m, installed in status["style_extraction"]],
        music_generation=[_to_response(m, installed) for m, installed in status["music_generation"]],
    )

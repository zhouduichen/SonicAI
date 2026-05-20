"""Hardware tier configuration endpoint."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.model_recommender import (
    get_tier_config,
    HardwareTier,
)

router = APIRouter(prefix="/config", tags=["config"])


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

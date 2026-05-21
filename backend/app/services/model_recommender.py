"""Hardware tier → model preset mapping with VRAM validation.

Re-exports tier config types and functions from app.core.config (single source of truth).
"""

from app.core.config import (
    HardwareTier,
    PreferenceMode,
    TierPreset,
    TierConfig,
    TIER_CONFIGS,
    get_tier_config,
    get_preset,
    validate_vram,
)

__all__ = [
    "HardwareTier",
    "PreferenceMode",
    "TierPreset",
    "TierConfig",
    "TIER_CONFIGS",
    "get_tier_config",
    "get_preset",
    "validate_vram",
]

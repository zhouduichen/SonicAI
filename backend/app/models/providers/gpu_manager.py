"""GPU memory manager for sequential model loading on RTX 5080 16GB."""

import logging
from app.models.providers.base import ModelProvider

logger = logging.getLogger(__name__)

# RTX 5080 total VRAM
TOTAL_VRAM_GB = 16.0
SAFE_VRAM_GB = 12.0  # Conservative limit for OS + other processes


class GPUMemoryManager:
    """Ensures only one model is loaded at a time within VRAM budget."""

    def __init__(self):
        self._current: ModelProvider | None = None
        self._total_vram = TOTAL_VRAM_GB
        self._safe_vram = SAFE_VRAM_GB

    @property
    def current_model(self) -> ModelProvider | None:
        return self._current

    def acquire(self, provider: ModelProvider) -> None:
        """Load a model, unloading the previous one if needed."""
        vram = provider.vram_required()
        if vram > self._safe_vram:
            logger.warning(
                f"Model {provider.model_key} requires {vram}GB VRAM "
                f"(safe limit: {self._safe_vram}GB). May cause OOM."
            )

        if self._current is not None:
            if self._current.model_key == provider.model_key and self._current.is_loaded():
                logger.info(f"Model {provider.model_key} already loaded, reusing")
                return
            logger.info(f"Unloading {self._current.model_key}")
            self._current.unload()
            self._current = None

        logger.info(f"Loading {provider.model_key} ({vram}GB VRAM)")
        provider.load()
        self._current = provider

    def release_all(self) -> None:
        """Unload the current model and free all VRAM."""
        if self._current is not None:
            logger.info(f"Releasing {self._current.model_key}")
            self._current.unload()
            self._current = None


# Module-level singleton
gpu_manager = GPUMemoryManager()

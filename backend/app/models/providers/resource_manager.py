"""Resource manager: GPU memory + execution path selection for local models."""

import logging
import os
from app.models.providers.base import ModelProvider
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class ResourceManager:
    """Ensures one model loaded at a time. Selects GPU>ONNX>Mock execution path."""

    def __init__(self, vram_budget_gb: float | None = None):
        self._current: ModelProvider | None = None
        self._vram_budget = vram_budget_gb if vram_budget_gb is not None else self._default_budget()

    @staticmethod
    def _default_budget() -> float:
        """Read VRAM budget from hardware tier config (via SONICAI_HARDWARE_TIER env)."""
        try:
            from app.core.config import get_tier_config
            tier = settings.SONICAI_HARDWARE_TIER
            config = get_tier_config(tier)
            return config.max_vram_gb
        except Exception:
            return 16.0

    @property
    def vram_budget(self) -> float:
        return self._vram_budget

    @vram_budget.setter
    def vram_budget(self, value: float) -> None:
        self._vram_budget = value

    @property
    def current_model(self) -> ModelProvider | None:
        return self._current

    def _gpu_available(self) -> bool:
        """Check if CUDA GPU is available."""
        try:
            import torch
            return torch.cuda.is_available()
        except ImportError:
            return False

    def _onnx_model_exists(self, provider: ModelProvider) -> bool:
        """Check if ONNX model file exists for this provider."""
        onnx_dir = os.path.expanduser("~/.sonicai/models")
        manifest = os.path.join(onnx_dir, "model_manifest.json")
        if not os.path.exists(manifest):
            return False
        import json
        with open(manifest, "r") as f:
            models = json.load(f)
        return provider.model_key in models

    def acquire(self, provider: ModelProvider) -> None:
        """Load a model via the best available path (GPU > ONNX > Mock)."""
        vram = provider.vram_required()
        gpu_ok = provider.supports_gpu() and self._gpu_available() and vram <= self._vram_budget
        use_gpu = gpu_ok

        if not use_gpu and not provider.supports_gpu():
            logger.info(f"Provider {provider.model_key} is CPU/ONNX-only, bypassing GPU path")

        # Unload previous model if needed
        if self._current is not None:
            if self._current.model_key == provider.model_key and self._current.is_loaded():
                logger.info(f"Model {provider.model_key} already loaded, reusing")
                return
            logger.info(f"Unloading {self._current.model_key}")
            self._current.unload()
            self._current = None

        # Determine execution path
        if use_gpu:
            exec_path = "gpu"
        elif self._onnx_model_exists(provider):
            exec_path = "onnx"
            logger.info(f"Using ONNX path for {provider.model_key}")
        else:
            exec_path = "mock"
            if provider.supports_gpu():
                logger.warning(
                    f"GPU path unavailable for {provider.model_key}: "
                    f"vram={vram}GB budget={self._vram_budget}GB gpu={self._gpu_available()}. "
                    f"ONNX models not found. Falling back to mock."
                )

        logger.info(f"Loading {provider.model_key} (path={exec_path}, vram={vram}GB)")
        provider.load(use_onnx=(exec_path == "onnx"), force_mock=(exec_path == "mock"))
        self._current = provider

    def release_all(self) -> None:
        """Unload current model, free all resources."""
        if self._current is not None:
            logger.info(f"Releasing {self._current.model_key}")
            self._current.unload()
            self._current = None


# Module-level singleton — budget auto-detected from SONICAI_HARDWARE_TIER
resource_manager = ResourceManager()

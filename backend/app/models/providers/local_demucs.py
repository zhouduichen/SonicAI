"""Local Demucs provider for vocal separation."""

import os
import shutil
import time
import logging
from app.models.providers.base import VocalSepProvider
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Try to import demucs; fall back to mock if not installed
try:
    import demucs.separate as _demucs_separate

    DEMUCS_AVAILABLE = True
    logger.info("Demucs package found — using real vocal separation")
except ImportError:
    DEMUCS_AVAILABLE = False
    logger.warning("Demucs not installed — using mock vocal separation")


class LocalDemucsProvider(VocalSepProvider):
    """Local Demucs provider with mock fallback."""

    def __init__(self, model_key: str):
        self._key = model_key
        self._loaded = False

    @property
    def model_key(self) -> str:
        return self._key

    def load(self) -> None:
        self._loaded = True
        if not DEMUCS_AVAILABLE:
            logger.info(f"Mock Demucs ({self._key}) ready")

    def unload(self) -> None:
        self._loaded = False

    def is_loaded(self) -> bool:
        return self._loaded

    def vram_required(self) -> float:
        return {"demucs_htdemucs": 6.5, "demucs_mdx_extra": 5.0, "demucs_6s": 4.5, "spleeter_2stems": 1.5, "spleeter_5stems": 2.0}.get(self._key, 5.0)

    # Map registry keys to demucs model names (they differ for some variants)
    _DEMUCS_MODEL_MAP = {
        "demucs_htdemucs": "htdemucs",
        "demucs_mdx_extra": "mdx_extra",
        "demucs_6s": "htdemucs_6s",
    }

    def separate(self, audio_path: str) -> str:
        os.makedirs(settings.GENERATED_DIR, exist_ok=True)
        instrumental_name = os.path.splitext(os.path.basename(audio_path))[0] + "_instrumental.wav"
        instrumental_path = os.path.join(settings.GENERATED_DIR, instrumental_name)

        if DEMUCS_AVAILABLE:
            out_dir = os.path.join(settings.GENERATED_DIR, "demucs_out")
            demucs_model = self._DEMUCS_MODEL_MAP.get(self._key, self._key)
            _demucs_separate.main(["--two-stems", "vocals", "-n", demucs_model, "-o", out_dir, audio_path])
            demucs_output = os.path.join(out_dir, demucs_model, os.path.splitext(os.path.basename(audio_path))[0], "no_vocals.wav")
            if os.path.exists(demucs_output):
                shutil.move(demucs_output, instrumental_path)
                return instrumental_path

        # Mock fallback: copy original as instrumental
        time.sleep(2)
        shutil.copy(audio_path, instrumental_path)
        return instrumental_path

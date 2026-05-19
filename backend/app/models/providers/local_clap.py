"""Local CLAP provider for style embedding extraction."""

import time
import random
import logging
from app.models.providers.base import StyleExtractProvider

logger = logging.getLogger(__name__)

try:
    import laion_clap

    CLAP_AVAILABLE = True
    logger.info("laion_clap package found")
except ImportError:
    CLAP_AVAILABLE = False
    logger.warning("laion_clap not installed — using mock style extraction")


class LocalCLAPProvider(StyleExtractProvider):
    """Local CLAP provider with mock fallback."""

    def __init__(self, model_key: str):
        self._key = model_key
        self._loaded = False
        self._model = None

    @property
    def model_key(self) -> str:
        return self._key

    def load(self) -> None:
        if CLAP_AVAILABLE:
            self._model = laion_clap.CLAP_Module(enable_fusion=False)
            ckpt_map = {
                "clap_laion": "music_audioset_epoch_15_esc_90.14.pt",
                "clap_msclap": "music_speech_audioset_epoch_15_esc_89.98.pt",
                "clap_htsat": "epoch_15_esc_89.98.pt",
            }
            self._model.load_ckpt(ckpt_map.get(self._key, ckpt_map["clap_laion"]))
        self._loaded = True

    def unload(self) -> None:
        self._loaded = False
        self._model = None

    def is_loaded(self) -> bool:
        return self._loaded

    def vram_required(self) -> float:
        return {"clap_laion": 1.2, "clap_msclap": 1.5, "clap_htsat": 3.0, "encodec_6kbps": 0.8}.get(self._key, 1.5)

    def extract(self, audio_path: str) -> list[float]:
        dim_map = {"clap_laion": 512, "clap_msclap": 1024, "clap_htsat": 512, "encodec_6kbps": 128}
        dim = dim_map.get(self._key, 512)

        if CLAP_AVAILABLE and self._model is not None:
            try:
                emb = self._model.get_audio_embedding_from_filelist(x=[audio_path])
                return emb[0].tolist()[:dim]
            except Exception as e:
                logger.error(f"CLAP extraction failed: {e}")

        # Mock fallback
        time.sleep(2)
        return [round(random.uniform(-1.0, 1.0), 6) for _ in range(dim)]

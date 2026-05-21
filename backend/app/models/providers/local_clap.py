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

    def load(self, use_onnx: bool = False) -> None:
        self._use_onnx = use_onnx
        if use_onnx:
            self._loaded = True
            logger.info(f"ONNX CLAP ({self._key}) ready (CPU path)")
            return
        if CLAP_AVAILABLE:
            try:
                self._model = laion_clap.CLAP_Module(enable_fusion=False)
                # Use model_id to auto-download from HuggingFace (cached after first download):
                # 0=630k, 1=630k+audioset (recommended), 2=630k-fusion, 3=630k+audioset-fusion
                model_id_map = {
                    "clap_laion": 1,
                    "clap_msclap": 0,
                    "clap_htsat": 1,
                }
                model_id = model_id_map.get(self._key, 1)
                self._model.load_ckpt(model_id=model_id)
                logger.info(f"CLAP model ({self._key}) loaded on GPU")
            except Exception as e:
                logger.warning(f"CLAP model ({self._key}) failed: {e}. Falling back to mock.")
                self._model = None
        self._loaded = True

    def unload(self) -> None:
        self._loaded = False
        self._model = None

    def is_loaded(self) -> bool:
        return self._loaded

    def vram_required(self) -> float:
        return {"clap_laion": 1.2, "clap_msclap": 1.5, "clap_htsat": 3.0, "encodec_6kbps": 0.8}.get(self._key, 1.5)

    def time_estimate(self, duration_seconds: int = 30) -> float:
        base = {"clap_laion": 15, "clap_msclap": 20, "clap_htsat": 40, "encodec_6kbps": 8}
        t = base.get(self._key, 20)
        if not self.supports_gpu() and not CLAP_AVAILABLE:
            t *= 3
        return t * (duration_seconds / 30)

    def supports_gpu(self) -> bool:
        return CLAP_AVAILABLE

    def _infer_onnx(self, audio_path: str) -> list[float] | None:
        """Attempt ONNX CPU inference. Returns embedding or None on failure."""
        try:
            from app.utils.onnx_helper import get_onnx_model_path
            import onnxruntime as ort
            import numpy as np
            import soundfile as sf

            model_path = get_onnx_model_path(self._key)
            if not model_path:
                return None

            audio, sr = sf.read(audio_path)
            if len(audio.shape) > 1:
                audio = audio.mean(axis=1)
            if sr != 48000 and sr > 0:
                audio = np.interp(
                    np.linspace(0, len(audio), int(len(audio) * 48000 / sr)),
                    np.arange(len(audio)), audio,
                )

            session = ort.InferenceSession(model_path)
            input_name = session.get_inputs()[0].name
            result = session.run(None, {input_name: audio.astype(np.float32)[np.newaxis, :]})
            embedding = result[0][0].tolist()
            dim_map = {"clap_laion": 512, "clap_msclap": 1024, "clap_htsat": 512, "encodec_6kbps": 128}
            dim = dim_map.get(self._key, 512)
            logger.info(f"ONNX extraction complete: {len(embedding[:dim])}d")
            return embedding[:dim]
        except Exception as e:
            logger.warning(f"ONNX inference failed for {self._key}: {e}")
            return None

    def extract(self, audio_path: str) -> list[float]:
        dim_map = {"clap_laion": 512, "clap_msclap": 1024, "clap_htsat": 512, "encodec_6kbps": 128}
        dim = dim_map.get(self._key, 512)

        if getattr(self, "_use_onnx", False):
            result = self._infer_onnx(audio_path)
            if result is not None:
                return result

        if CLAP_AVAILABLE and self._model is not None:
            try:
                emb = self._model.get_audio_embedding_from_filelist(x=[audio_path])
                return emb[0].tolist()[:dim]
            except Exception as e:
                logger.error(f"CLAP extraction failed: {e}")

        # Mock fallback
        time.sleep(2)
        return [round(random.uniform(-1.0, 1.0), 6) for _ in range(dim)]

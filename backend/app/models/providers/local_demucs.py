"""Local Demucs provider for vocal separation."""

import logging
import os
import shutil
import time

from app.core.config import get_settings
from app.models.providers.base import VocalSepProvider

logger = logging.getLogger(__name__)
settings = get_settings()

try:
    import demucs.separate as _demucs_separate

    DEMUCS_AVAILABLE = True
    logger.info("Demucs package found - using real vocal separation")
except ImportError:
    DEMUCS_AVAILABLE = False
    logger.warning("Demucs not installed - using mock vocal separation")


class LocalDemucsProvider(VocalSepProvider):
    """Local Demucs provider with mock fallback."""

    _DEMUCS_MODEL_MAP = {
        "demucs_htdemucs": "htdemucs",
        "demucs_mdx_extra": "mdx_extra",
        "demucs_6s": "htdemucs_6s",
    }

    def __init__(self, model_key: str):
        self._key = model_key
        self._loaded = False

    @property
    def model_key(self) -> str:
        return self._key

    def load(self, use_onnx: bool = False, force_mock: bool = False) -> None:
        self._use_onnx = use_onnx and not force_mock
        self._force_mock = force_mock
        if force_mock:
            self._loaded = True
            logger.info("Mock Demucs (%s) ready (forced)", self._key)
            return
        if not DEMUCS_AVAILABLE and not self._has_onnx():
            if not settings.ENABLE_MOCK_FALLBACK:
                raise RuntimeError(f"Mock fallback disabled - Demucs ({self._key}) not available")
            self._loaded = True
            logger.info("Mock Demucs (%s) ready", self._key)
            return
        self._loaded = True
        if use_onnx or not DEMUCS_AVAILABLE:
            logger.info("ONNX Demucs (%s) ready", self._key)

    def _has_onnx(self) -> bool:
        import json
        import os as _os

        manifest = _os.path.join(_os.path.expanduser("~/.sonicai/models"), "model_manifest.json")
        if not _os.path.exists(manifest):
            return False
        with open(manifest, "r", encoding="utf-8") as f:
            return self._key in json.load(f)

    def unload(self) -> None:
        self._loaded = False

    def is_loaded(self) -> bool:
        return self._loaded

    def vram_required(self) -> float:
        return {
            "demucs_htdemucs": 6.5,
            "demucs_mdx_extra": 5.0,
            "demucs_6s": 4.5,
            "spleeter_2stems": 1.5,
            "spleeter_5stems": 2.0,
        }.get(self._key, 5.0)

    def time_estimate(self, duration_seconds: int = 30) -> float:
        base = {
            "demucs_htdemucs": 60,
            "demucs_mdx_extra": 40,
            "demucs_6s": 50,
            "spleeter_2stems": 15,
            "spleeter_5stems": 25,
        }
        t = base.get(self._key, 40)
        if not self.supports_gpu() and not DEMUCS_AVAILABLE:
            t *= 3
        return t * (duration_seconds / 30)

    def supports_gpu(self) -> bool:
        return self._key.startswith("demucs") and DEMUCS_AVAILABLE

    def _copy_fallback(self, audio_path: str, output_path: str, reason: str) -> str:
        if not settings.ENABLE_MOCK_FALLBACK:
            raise RuntimeError(reason)
        logger.warning("%s; falling back to original audio copy", reason)
        time.sleep(2)
        shutil.copy(audio_path, output_path)
        return output_path

    def _infer_onnx(self, audio_path: str, output_path: str) -> str | None:
        """Attempt ONNX CPU inference. Returns output path or None on failure."""
        try:
            from app.utils.onnx_helper import get_onnx_model_path
            import numpy as np
            import onnxruntime as ort
            import soundfile as sf

            model_path = get_onnx_model_path(self._key)
            if not model_path:
                return None

            audio, sr = sf.read(audio_path)
            if len(audio.shape) > 1:
                audio = audio.mean(axis=1)

            target_sr = 44100
            if sr != target_sr and sr > 0:
                audio = np.interp(
                    np.linspace(0, len(audio), int(len(audio) * target_sr / sr)),
                    np.arange(len(audio)),
                    audio,
                )

            session = ort.InferenceSession(model_path)
            input_name = session.get_inputs()[0].name
            result = session.run(None, {input_name: audio.astype(np.float32)[np.newaxis, :]})

            output = result[0][0]
            sf.write(output_path, output.T if output.ndim > 1 else output, target_sr)
            logger.info("ONNX separation complete: %s", output_path)
            return output_path
        except Exception as e:
            logger.warning("ONNX inference failed for %s: %s", self._key, e)
            return None

    def separate(self, audio_path: str, stem: str = "instrumental") -> str:
        os.makedirs(settings.GENERATED_DIR, exist_ok=True)
        stem_label = "vocals" if stem == "vocals" else "instrumental"
        output_name = os.path.splitext(os.path.basename(audio_path))[0] + f"_{stem_label}.wav"
        output_path = os.path.join(settings.GENERATED_DIR, output_name)

        if getattr(self, "_force_mock", False):
            return self._copy_fallback(audio_path, output_path, "Mock fallback disabled - Demucs forced mock")

        if getattr(self, "_use_onnx", False):
            result = self._infer_onnx(audio_path, output_path)
            if result:
                return result

        if DEMUCS_AVAILABLE:
            out_dir = os.path.join(settings.GENERATED_DIR, "demucs_out")
            demucs_model = self._DEMUCS_MODEL_MAP.get(self._key, self._key)
            try:
                _demucs_separate.main(["--two-stems", "vocals", "-n", demucs_model, "-o", out_dir, audio_path])
                demucs_stem_file = "vocals.wav" if stem == "vocals" else "no_vocals.wav"
                demucs_output = os.path.join(
                    out_dir,
                    demucs_model,
                    os.path.splitext(os.path.basename(audio_path))[0],
                    demucs_stem_file,
                )
                if os.path.exists(demucs_output):
                    shutil.move(demucs_output, output_path)
                    return output_path
                logger.warning("Demucs finished without expected output file: %s", demucs_output)
            except AssertionError as e:
                return self._copy_fallback(audio_path, output_path, f"Demucs assertion failure: {type(e).__name__}")
            except Exception as e:
                return self._copy_fallback(audio_path, output_path, f"Demucs separation failed: {e}")

        return self._copy_fallback(
            audio_path,
            output_path,
            f"Mock fallback disabled - Demucs ({self._key}) failed to separate audio",
        )

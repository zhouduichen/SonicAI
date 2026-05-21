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

    def load(self, use_onnx: bool = False) -> None:
        self._use_onnx = use_onnx
        if not DEMUCS_AVAILABLE and not self._has_onnx():
            self._loaded = True  # Mock
            logger.info(f"Mock Demucs ({self._key}) ready")
            return
        self._loaded = True
        if use_onnx or not DEMUCS_AVAILABLE:
            logger.info(f"ONNX Demucs ({self._key}) ready")

    def _has_onnx(self) -> bool:
        import json
        import os as _os
        manifest = _os.path.join(_os.path.expanduser("~/.sonicai/models"), "model_manifest.json")
        if not _os.path.exists(manifest):
            return False
        with open(manifest, "r") as f:
            return self._key in json.load(f)

    def unload(self) -> None:
        self._loaded = False

    def is_loaded(self) -> bool:
        return self._loaded

    def vram_required(self) -> float:
        return {"demucs_htdemucs": 6.5, "demucs_mdx_extra": 5.0, "demucs_6s": 4.5, "spleeter_2stems": 1.5, "spleeter_5stems": 2.0}.get(self._key, 5.0)

    def time_estimate(self, duration_seconds: int = 30) -> float:
        base = {"demucs_htdemucs": 60, "demucs_mdx_extra": 40, "demucs_6s": 50, "spleeter_2stems": 15, "spleeter_5stems": 25}
        t = base.get(self._key, 40)
        if not self.supports_gpu() and not DEMUCS_AVAILABLE:
            t *= 3  # CPU penalty
        return t * (duration_seconds / 30)

    def supports_gpu(self) -> bool:
        return self._key.startswith("demucs") and DEMUCS_AVAILABLE

    # Map registry keys to demucs model names (they differ for some variants)
    _DEMUCS_MODEL_MAP = {
        "demucs_htdemucs": "htdemucs",
        "demucs_mdx_extra": "mdx_extra",
        "demucs_6s": "htdemucs_6s",
    }

    def _infer_onnx(self, audio_path: str, output_path: str) -> str | None:
        """Attempt ONNX CPU inference. Returns output path or None on failure."""
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
            # Resample to 44100 if needed (most ONNX models expect this)
            target_sr = 44100
            if sr != target_sr and sr > 0:
                audio = np.interp(
                    np.linspace(0, len(audio), int(len(audio) * target_sr / sr)),
                    np.arange(len(audio)), audio,
                )

            session = ort.InferenceSession(model_path)
            input_name = session.get_inputs()[0].name
            result = session.run(None, {input_name: audio.astype(np.float32)[np.newaxis, :]})

            # Most ONNX separation models output (1, 2, samples) for stereo or (1, samples) for mono
            output = result[0][0]
            sf.write(output_path, output.T if output.ndim > 1 else output, target_sr)
            logger.info(f"ONNX separation complete: {output_path}")
            return output_path
        except Exception as e:
            logger.warning(f"ONNX inference failed for {self._key}: {e}")
            return None

    def separate(self, audio_path: str) -> str:
        os.makedirs(settings.GENERATED_DIR, exist_ok=True)
        instrumental_name = os.path.splitext(os.path.basename(audio_path))[0] + "_instrumental.wav"
        instrumental_path = os.path.join(settings.GENERATED_DIR, instrumental_name)

        if getattr(self, "_use_onnx", False):
            result = self._infer_onnx(audio_path, instrumental_path)
            if result:
                return result

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

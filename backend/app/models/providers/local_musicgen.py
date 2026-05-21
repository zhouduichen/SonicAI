"""Local MusicGen provider for music generation."""

import os
import time
import math
import struct
import wave
import uuid
import logging
from app.models.providers.base import MusicGenProvider
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

try:
    import torch
    from audiocraft.models import MusicGen as _MusicGenModel

    MUSICGEN_AVAILABLE = True
    logger.info("audiocraft package found — using real MusicGen")
except ImportError:
    MUSICGEN_AVAILABLE = False
    logger.warning("audiocraft not installed — using mock music generation")

try:
    from diffusers import AudioLDMPipeline  # noqa: F401

    AUDIOLDM_AVAILABLE = True
    logger.info("diffusers package found — AudioLDM available")
except ImportError:
    AUDIOLDM_AVAILABLE = False
    logger.warning("diffusers not installed — AudioLDM will use mock")


class LocalMusicGenProvider(MusicGenProvider):
    """Local MusicGen provider with mock fallback."""

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
            logger.info(f"ONNX MusicGen ({self._key}) ready (CPU path)")
            return
        if self._model is not None:
            self._loaded = True
            return

        if MUSICGEN_AVAILABLE and not self._key.startswith("audioldm"):
            try:
                hf_names = {
                    "musicgen_small": "facebook/musicgen-small",
                    "musicgen_medium": "facebook/musicgen-medium",
                    "musicgen_large": "facebook/musicgen-large",
                    "musicgen_melody": "facebook/musicgen-melody",
                }
                name = hf_names.get(self._key, "facebook/musicgen-small")
                self._model = _MusicGenModel.get_pretrained(name)
                self._model.set_generation_params(duration=30)
                self._loaded = True
                logger.info(f"MusicGen model loaded: {name}")
            except Exception as e:
                logger.error(f"Failed to load MusicGen: {e}")
                self._loaded = False
                self._model = None
        else:
            self._loaded = True  # Mock

    def unload(self) -> None:
        self._loaded = False
        self._model = None

    def is_loaded(self) -> bool:
        return self._loaded

    def vram_required(self) -> float:
        return {"musicgen_small": 2.5, "musicgen_medium": 5.0, "musicgen_large": 8.0, "musicgen_melody": 5.5, "audioldm2": 6.0}.get(self._key, 5.0)

    def time_estimate(self, duration_seconds: int = 30) -> float:
        base = {"musicgen_small": 45, "musicgen_medium": 90, "musicgen_large": 180, "musicgen_melody": 100, "audioldm2": 120}
        t = base.get(self._key, 90)
        if not self.supports_gpu():
            t *= 3
        return t * (duration_seconds / 30)

    def supports_gpu(self) -> bool:
        return MUSICGEN_AVAILABLE

    def _infer_onnx(self, embedding: list[float], text_prompt: str, output_path: str) -> dict | None:
        """Attempt ONNX CPU inference. Returns result dict or None on failure."""
        try:
            from app.utils.onnx_helper import get_onnx_model_path
            import onnxruntime as ort
            import numpy as np

            model_path = get_onnx_model_path(self._key)
            if not model_path:
                return None

            session = ort.InferenceSession(model_path)
            input_names = [inp.name for inp in session.get_inputs()]
            inputs = {}
            for name in input_names:
                if "embed" in name.lower():
                    inputs[name] = np.array(embedding, dtype=np.float32)[np.newaxis, :]
                elif "text" in name.lower():
                    # ONNX text input is typically tokenized; pass as raw for now
                    inputs[name] = np.array([ord(c) for c in text_prompt[:256]], dtype=np.int64)[np.newaxis, :]
                else:
                    inputs[name] = np.zeros((1, 1), dtype=np.float32)

            result = session.run(None, inputs)
            audio = result[0][0]

            import wave, struct
            sr = 32000
            with wave.open(output_path, "w") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(sr)
                for sample in audio[: sr * 30]:
                    wav.writeframes(struct.pack("<h", max(-32768, min(32767, int(sample * 32767)))))

            duration = min(len(audio) / sr, 30)
            logger.info(f"ONNX generation complete: {output_path} ({duration:.1f}s)")
            return {"file_path": output_path, "duration_seconds": duration}
        except Exception as e:
            logger.warning(f"ONNX inference failed for {self._key}: {e}")
            return None

    def generate(self, embedding: list[float], text_prompt: str) -> dict:
        os.makedirs(settings.GENERATED_DIR, exist_ok=True)
        output_filename = f"generated_{uuid.uuid4().hex[:8]}.wav"
        output_path = os.path.join(settings.GENERATED_DIR, output_filename)

        duration = 30

        if getattr(self, "_use_onnx", False):
            result = self._infer_onnx(embedding, text_prompt, output_path)
            if result is not None:
                return result

        if MUSICGEN_AVAILABLE and self._model is not None and not self._key.startswith("audioldm"):
            try:
                import torchaudio
                embedding_tensor = torch.tensor(embedding, dtype=torch.float32).unsqueeze(0)
                wav_tokens = self._model.generate_with_chroma(
                    descriptions=[text_prompt],
                    melody_wavs=None,
                    progress=True,
                )
                wav = wav_tokens[0].cpu()
                torchaudio.save(output_path, wav, 32000)
                duration = int(wav.shape[-1] / 32000)
                return {"file_path": output_path, "duration_seconds": duration}
            except Exception as e:
                logger.error(f"MusicGen generation failed: {e}")

        # Mock fallback: generate a sine tone WAV
        sample_rate = 32000
        duration = 30
        with wave.open(output_path, "w") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            for i in range(sample_rate * duration):
                value = int(12000 * math.sin(2.0 * math.pi * 440 * i / sample_rate))
                wav.writeframes(struct.pack("<h", value))

        return {"file_path": output_path, "duration_seconds": duration}

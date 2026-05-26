"""Local MusicGen provider for music generation.

Uses HuggingFace transformers (MusicgenForConditionalGeneration) —
no audiocraft or diffusers required.
"""

import os
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
    import torchaudio
    from transformers import AutoProcessor, MusicgenForConditionalGeneration

    MUSICGEN_AVAILABLE = True
    logger.info("transformers + torch OK — real MusicGen available")
except ImportError:
    MUSICGEN_AVAILABLE = False
    logger.warning("transformers not available — using mock music generation")

AUDIOLDM_AVAILABLE = False  # diffusers not installed, always use MusicGen path


class LocalMusicGenProvider(MusicGenProvider):
    """Local MusicGen provider with mock fallback."""

    def __init__(self, model_key: str):
        self._key = model_key
        self._loaded = False
        self._model = None

    @property
    def model_key(self) -> str:
        return self._key

    def load(self, use_onnx: bool = False, force_mock: bool = False) -> None:
        self._use_onnx = use_onnx and not force_mock
        self._force_mock = force_mock
        if force_mock:
            self._loaded = True
            self._model = None
            logger.info(f"Mock MusicGen ({self._key}) ready (forced)")
            return
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

                # Use default HF_HOME cache (~/.cache/huggingface/hub/) so
                # pre-cached models from precache_models.py are reused.
                import os as _os2
                hf_home = _os2.environ.get("HF_HOME") or _os2.path.expanduser("~/.cache/huggingface")
                _os2.environ.setdefault("HF_HOME", hf_home)
                _os2.environ.setdefault("HF_HUB_CACHE", _os2.path.join(hf_home, "hub"))
                _os2.environ.setdefault("TRANSFORMERS_CACHE", _os2.path.join(hf_home, "hub"))

                self._processor = AutoProcessor.from_pretrained(name)
                self._model = MusicgenForConditionalGeneration.from_pretrained(name)
                device = "cuda" if torch.cuda.is_available() else "cpu"
                self._model = self._model.to(device)
                self._loaded = True
                logger.info(f"MusicGen model loaded: {name} (device={device})")
            except Exception as e:
                logger.error(f"Failed to load MusicGen: {e}")
                self._loaded = False
                self._model = None
        else:
            self._loaded = True  # Mock for AudioLDM or uninstalled

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

    def generate(self, embedding: list[float], text_prompt: str, reference_audio_path: str | None = None) -> dict:
        os.makedirs(settings.GENERATED_DIR, exist_ok=True)
        output_filename = f"generated_{uuid.uuid4().hex[:8]}.wav"
        output_path = os.path.join(settings.GENERATED_DIR, output_filename)

        duration = 30

        if getattr(self, "_force_mock", False):
            # Skip straight to mock fallback
            pass
        elif getattr(self, "_use_onnx", False):
            result = self._infer_onnx(embedding, text_prompt, output_path)
            if result is not None:
                result["provider_mode"] = "real"
                return result
        elif MUSICGEN_AVAILABLE and self._model is not None and not self._key.startswith("audioldm"):
            try:
                import numpy as np
                import soundfile as sf

                processor_kwargs: dict = {
                    "text": [text_prompt],
                    "padding": True,
                    "return_tensors": "pt",
                }

                # For musicgen-melody, pass reference audio as melody conditioning
                is_melody = "melody" in self._key
                if is_melody and reference_audio_path and os.path.exists(reference_audio_path):
                    try:
                        melody_audio, melody_sr = sf.read(reference_audio_path)
                        if melody_audio.ndim > 1:
                            melody_audio = melody_audio.mean(axis=1)
                        processor_kwargs["audio"] = [melody_audio]
                        processor_kwargs["sampling_rate"] = [melody_sr]
                        logger.info(f"MusicGen melody conditioning: {reference_audio_path}")
                    except Exception as e:
                        logger.warning(f"Failed to load reference audio for melody: {e}")

                inputs = self._processor(**processor_kwargs)
                device = "cuda" if torch.cuda.is_available() else "cpu"
                inputs = {k: v.to(device) for k, v in inputs.items()}

                # Use embedding norm as guidance_scale (stronger style → higher adherence)
                emb_norm = float(np.linalg.norm(embedding)) if embedding else 0.0
                guidance_scale = 1.0 + min(emb_norm / 10.0, 2.0)  # range [1.0, 3.0]

                with torch.no_grad():
                    audio_values = self._model.generate(
                        **inputs,
                        max_new_tokens=1500,
                        guidance_scale=guidance_scale,
                    )
                wav = audio_values[0].cpu()
                sample_rate = self._model.config.audio_encoder.sampling_rate

                audio_np = wav.squeeze().numpy().T
                if audio_np.ndim > 1:
                    audio_np = audio_np.mean(axis=0)
                sf.write(output_path, audio_np, int(sample_rate))

                duration = int(audio_np.shape[-1] / sample_rate)
                logger.info(f"MusicGen generated: {output_path} ({duration}s, {sample_rate}Hz, guidance={guidance_scale:.2f}, melody={is_melody and reference_audio_path is not None})")
                return {"file_path": output_path, "duration_seconds": duration, "provider_mode": "real"}
            except Exception as e:
                logger.error(f"MusicGen generation failed: {e}")
                if not get_settings().ENABLE_MOCK_FALLBACK:
                    raise

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

        return {"file_path": output_path, "duration_seconds": duration, "provider_mode": "mock"}

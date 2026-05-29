"""MusicGen: text-prompt / melody-conditioned audio generation.

Variants:
  - musicgen_small  (300M params, fast)
  - musicgen_medium (1.5B params, balanced)
  - musicgen_large  (3.3B params, best quality)
  - musicgen_melody (1.5B, melody-conditioned)
"""

from __future__ import annotations

import logging
import math
import struct
import tempfile
import wave
from typing import Any

import torch

from core.registry import register_model
from core.schemas import TensorSpec
from models.base import BaseModel

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Variant metadata
# ---------------------------------------------------------------------------

MUSICGEN_VARIANTS: dict[str, dict[str, Any]] = {
    "musicgen_small": {"hf_name": "facebook/musicgen-small", "params": "300M"},
    "musicgen_medium": {"hf_name": "facebook/musicgen-medium", "params": "1.5B"},
    "musicgen_large": {"hf_name": "facebook/musicgen-large", "params": "3.3B"},
    "musicgen_melody": {"hf_name": "facebook/musicgen-melody", "params": "1.5B"},
}

# ---------------------------------------------------------------------------
# Lazy import (HF transformers does heavy downloads at import)
# ---------------------------------------------------------------------------

MUSICGEN_AVAILABLE = False

try:
    import torch as _torch2  # noqa: F401
    import torchaudio  # noqa: F401
    from transformers import AutoProcessor, MusicgenForConditionalGeneration  # noqa: F401

    MUSICGEN_AVAILABLE = True
    logger.info("transformers + torchaudio OK — real MusicGen available")
except ImportError:
    logger.info("transformers not available — using mock music generation")


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------


@register_model("musicgen")
class MusicGenModel(BaseModel):
    """Text-conditioned music generation.

    Input:  ``x`` should be a dummy tensor ``(B, 1, 1)``.
            The text prompt is passed via ``metadata["text"]``.
            For melody conditioning, pass audio via ``metadata["melody_path"]``
            or set ``x`` to the conditioning waveform ``(B, 1, T)``.

    Output: ``(B, 1, T')`` generated audio waveform at the model's sample rate.
    """

    input_spec = None  # input is text-driven, shape varies

    def __init__(
        self,
        variant: str = "musicgen_small",
        force_mock: bool = False,
        use_onnx: bool = False,
        **kwargs: Any,
    ) -> None:
        super().__init__()
        if variant not in MUSICGEN_VARIANTS:
            raise ValueError(
                f"Unknown MusicGen variant '{variant}'. "
                f"Available: {', '.join(sorted(MUSICGEN_VARIANTS))}"
            )
        self.variant = variant
        self.meta = MUSICGEN_VARIANTS[variant]
        self._force_mock = force_mock
        self._use_onnx = use_onnx

        # Lazy-loaded HF pipeline
        self._processor: Any = None
        self._hf_model: Any = None
        self._loaded = False

    # ------------------------------------------------------------------
    # Load / unload
    # ------------------------------------------------------------------

    def load_model(self) -> None:
        if self._loaded:
            return
        if self._force_mock:
            self._loaded = True
            logger.info("Mock MusicGen (%s) ready (forced)", self.variant)
            return
        if self._use_onnx:
            self._loaded = True
            logger.info("ONNX MusicGen (%s) ready", self.variant)
            return

        if not MUSICGEN_AVAILABLE:
            self._loaded = True
            logger.info("transformers unavailable — mock MusicGen (%s)", self.variant)
            return

        try:
            name = self.meta["hf_name"]
            self._processor = AutoProcessor.from_pretrained(name)
            self._hf_model = MusicgenForConditionalGeneration.from_pretrained(name)
            device = "cuda" if torch.cuda.is_available() else "cpu"
            self._hf_model = self._hf_model.to(device)
            self._loaded = True
            logger.info("MusicGen loaded: %s (device=%s)", name, device)
        except Exception as e:
            logger.warning("MusicGen load failed: %s — using mock", e)
            self._loaded = True

    def unload_model(self) -> None:
        self._hf_model = None
        self._processor = None
        self._loaded = False

    # ------------------------------------------------------------------
    # Core forward
    # ------------------------------------------------------------------

    def _forward(  # type: ignore[override]
        self,
        x: torch.Tensor,
        text: str = "",
        guidance_scale: float = 3.0,
        melody_path: str | None = None,
        **kwargs: Any,
    ) -> torch.Tensor:
        """Generate audio from text prompt.

        Args:
            x: Dummy tensor or conditioning waveform ``(B, 1, T)``.
            text: Text prompt describing the desired music.
            guidance_scale: Classifier-free guidance scale (1.0–3.0).
            melody_path: Optional path to reference audio for melody conditioning.

        Returns:
            ``(B, 1, T')`` generated audio waveform.
        """
        self.load_model()
        B = x.shape[0]

        if self._force_mock or not self._hf_model:
            return self._mock_generate(B, x.device)

        if self._use_onnx:
            return self._forward_onnx(x, text)

        return self._forward_hf(text, guidance_scale, melody_path, x.device)

    # ------------------------------------------------------------------
    # HuggingFace generation
    # ------------------------------------------------------------------

    @torch.no_grad()
    def _forward_hf(
        self,
        text: str,
        guidance_scale: float,
        melody_path: str | None,
        _device: torch.device,  # from x; prefer HF model's actual device
    ) -> torch.Tensor:
        import soundfile as sf
        import numpy as np

        processor_kwargs: dict[str, Any] = {
            "text": [text],
            "padding": True,
            "return_tensors": "pt",
        }

        is_melody = "melody" in self.variant
        if is_melody and melody_path:
            try:
                melody_audio, melody_sr = sf.read(melody_path)
                if melody_audio.ndim > 1:
                    melody_audio = melody_audio.mean(axis=1)
                processor_kwargs["audio"] = [melody_audio]
                processor_kwargs["sampling_rate"] = [melody_sr]
                logger.info("Melody conditioning: %s", melody_path)
            except Exception as e:
                logger.warning("Failed to load melody reference: %s", e)

        inputs = self._processor(**processor_kwargs)
        # Use HF model's device (not x.device — x may be CPU while model is CUDA)
        model_device = next(self._hf_model.parameters()).device
        inputs = {k: v.to(model_device) for k, v in inputs.items()}

        with torch.no_grad():
            audio_values = self._hf_model.generate(
                **inputs,
                max_new_tokens=1500,
                guidance_scale=guidance_scale,
            )

        wav = audio_values[0].cpu()
        sample_rate = self._hf_model.config.audio_encoder.sampling_rate
        audio_np = wav.squeeze().numpy()
        if audio_np.ndim > 1:
            audio_np = audio_np.mean(axis=0)

        # Save temp file then reload as tensor (pragmatic bridge)
        import tempfile as _tf
        tmp = _tf.NamedTemporaryFile(suffix=".wav", delete=False)
        sf.write(tmp.name, audio_np, int(sample_rate))

        result, _ = sf.read(tmp.name)
        result_t = torch.from_numpy(result).float().unsqueeze(0).unsqueeze(0)  # (1, 1, T)
        logger.debug("MusicGen output shape=%s", tuple(result_t.shape))
        return result_t.to(model_device)

    # ------------------------------------------------------------------
    # ONNX path (skeleton)
    # ------------------------------------------------------------------

    def _forward_onnx(self, x: torch.Tensor, text: str) -> torch.Tensor:
        logger.warning("ONNX MusicGen not fully implemented — returning mock")
        return self._mock_generate(x.shape[0], x.device)

    # ------------------------------------------------------------------
    # Mock
    # ------------------------------------------------------------------

    def _mock_generate(self, batch_size: int, device: torch.device) -> torch.Tensor:
        """440 Hz sine wave as mock generated audio."""
        sr = 32000
        duration = 4  # seconds
        t = torch.linspace(0, duration, sr * duration, device=device)
        wave = torch.sin(2.0 * math.pi * 440 * t) * 0.5
        return wave.unsqueeze(0).unsqueeze(0).expand(batch_size, -1, -1)  # (B, 1, T)

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    def extra_repr(self) -> str:
        return f"variant={self.variant}, params={self.meta['params']}"

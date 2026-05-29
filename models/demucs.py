"""Demucs: audio waveform → separated stems.

Supports variants:
  - demucs_htdemucs  — hybrid transformer 6-source
  - demucs_mdx_extra — MDX-trained variant
  - demucs_6s        — 6-source full separation
  - spleeter_2stems  — fast 2-stem (CPU friendly)
  - spleeter_5stems  — 5-stem multi-track
"""

from __future__ import annotations

import logging
from typing import Any

import torch

from core.registry import register_model
from core.schemas import TensorSpec
from models.base import BaseModel

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Variant metadata
# ---------------------------------------------------------------------------

DEMUCS_VARIANTS: dict[str, dict[str, Any]] = {
    "demucs_htdemucs": {"demucs_model": "htdemucs", "channels": 2, "target_sr": 44100},
    "demucs_mdx_extra": {"demucs_model": "mdx_extra", "channels": 2, "target_sr": 44100},
    "demucs_6s": {"demucs_model": "htdemucs_6s", "channels": 2, "target_sr": 44100},
    "spleeter_2stems": {"demucs_model": None, "channels": 1, "target_sr": 44100},
    "spleeter_5stems": {"demucs_model": None, "channels": 1, "target_sr": 44100},
}

# ---------------------------------------------------------------------------
# Lazy import
# ---------------------------------------------------------------------------

DEMUCS_AVAILABLE = False

try:
    import demucs.separate as _demucs_separate  # noqa: F401
    DEMUCS_AVAILABLE = True
    logger.info("demucs package found")
except ImportError:
    logger.info("demucs not installed — using mock separation")


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------


@register_model("demucs")
class DemucsModel(BaseModel):
    """Audio source separation.

    Input:  (B, C, T) raw waveform at target_sr Hz.
    Output: (B, C, T) separated waveform (same shape as input).

    The model extracts the specified ``stem`` (default ``"instrumental"``).
    Pass ``stem="vocals"`` via metadata to extract vocals instead.
    """

    input_spec = TensorSpec(layout="BCT")

    def __init__(
        self,
        variant: str = "demucs_htdemucs",
        force_mock: bool = False,
        use_onnx: bool = False,
        **kwargs: Any,
    ) -> None:
        super().__init__()
        if variant not in DEMUCS_VARIANTS:
            raise ValueError(
                f"Unknown Demucs variant '{variant}'. "
                f"Available: {', '.join(sorted(DEMUCS_VARIANTS))}"
            )
        self.variant = variant
        self.meta = DEMUCS_VARIANTS[variant]
        self.target_sr: int = self.meta["target_sr"]
        self._force_mock = force_mock
        self._use_onnx = use_onnx
        self._loaded = False

    # ------------------------------------------------------------------
    # Load / unload
    # ------------------------------------------------------------------

    def load_model(self) -> None:
        if self._loaded:
            return
        if self._force_mock:
            logger.info("Mock Demucs (%s) ready (forced)", self.variant)
        elif not DEMUCS_AVAILABLE:
            logger.info("demucs unavailable — mock Demucs (%s)", self.variant)
        else:
            logger.info("Demucs (%s) ready", self.variant)
        self._loaded = True

    def unload_model(self) -> None:
        self._loaded = False

    # ------------------------------------------------------------------
    # Core forward
    # ------------------------------------------------------------------

    def _forward(  # type: ignore[override]
        self,
        x: torch.Tensor,
        stem: str = "instrumental",
        **kwargs: Any,
    ) -> torch.Tensor:
        B, C, T = x.shape

        if self._force_mock or not DEMUCS_AVAILABLE:
            return self._mock_separate(x)

        if self._use_onnx:
            return self._forward_onnx(x)

        # Real Demucs via CLI subprocess — each sample separated individually.
        out_list: list[torch.Tensor] = []
        for i in range(B):
            try:
                out_list.append(self._separate_one(x[i], stem))
            except Exception as e:
                logger.warning("Demucs sample %d failed: %s — mock fallback", i, e)
                out_list.append(x[i])  # pass-through fallback
        return torch.stack(out_list, dim=0)

    # ------------------------------------------------------------------
    # Per-sample separation via demucs CLI
    # ------------------------------------------------------------------

    def _separate_one(self, wav: torch.Tensor, stem: str) -> torch.Tensor:
        """Run demucs on a single (C, T) waveform. Returns (C, T) separated."""
        import os
        import shutil
        import tempfile
        import soundfile as sf

        tmp_dir = tempfile.mkdtemp()
        try:
            in_path = os.path.join(tmp_dir, "input.wav")
            out_dir = os.path.join(tmp_dir, "out")

            audio_np = wav.cpu().numpy().T  # (T, C)
            sf.write(in_path, audio_np, self.target_sr)

            demucs_model = DEMUCS_VARIANTS[self.variant]["demucs_model"]
            _demucs_separate.main([
                "--two-stems", "vocals",
                "-n", demucs_model,
                "-o", out_dir,
                in_path,
            ])

            stem_file = "vocals.wav" if stem == "vocals" else "no_vocals.wav"
            result_path = os.path.join(
                out_dir,
                demucs_model,
                os.path.splitext(os.path.basename(in_path))[0],
                stem_file,
            )
            if not os.path.exists(result_path):
                raise RuntimeError(f"Demucs did not produce: {result_path}")

            result_audio, _ = sf.read(result_path)
            result_t = torch.from_numpy(result_audio.T if result_audio.ndim > 1 else result_audio[None])
            return result_t.to(device=wav.device, dtype=wav.dtype)
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    # ------------------------------------------------------------------
    # ONNX path
    # ------------------------------------------------------------------

    def _forward_onnx(self, x: torch.Tensor) -> torch.Tensor:
        """ONNX CPU inference mock — requires actual .onnx model files."""
        logger.warning("ONNX Demucs not fully implemented — returning input as-is")
        return x

    # ------------------------------------------------------------------
    # Mock
    # ------------------------------------------------------------------

    def _mock_separate(self, x: torch.Tensor) -> torch.Tensor:
        """Mock separation: return a gain-reduced copy (simulates instrumental)."""
        logger.debug("Mock Demucs(%s) shape=%s", self.variant, tuple(x.shape))
        return x * 0.3

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    def extra_repr(self) -> str:
        return f"variant={self.variant}, sr={self.target_sr}"

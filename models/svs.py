"""SVS (Singing Voice Synthesis): lyrics → sung audio.

Input:  conditioning audio via ``x`` (optional), lyrics via ``metadata["lyrics"]``.
Output: ``(B, 1, T)`` sung audio waveform.
"""

from __future__ import annotations

import logging
import math
import struct
import wave
from typing import Any

import torch

from core.registry import register_model
from core.schemas import TensorSpec
from models.base import BaseModel

logger = logging.getLogger(__name__)


@register_model("svs")
class SVSModel(BaseModel):
    """Singing voice synthesis from lyrics text.

    Input:  ``x`` is a dummy tensor ``(B, 1, 1)``.
            Lyrics are passed via ``metadata["lyrics"]`` (string, lines separated
            by newlines). Optional conditioning via ``metadata["melody_path"]``
            and ``metadata["voice_ref_path"]``.

    Output: ``(B, 1, T)`` sung audio waveform at 32 kHz.
    """

    input_spec = None  # text-driven, shape varies

    def __init__(
        self,
        force_mock: bool = True,
        api_url: str | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__()
        self._force_mock = force_mock
        self._api_url = api_url
        self._loaded = False
        self._external_available = False

    def load_model(self) -> None:
        if self._loaded:
            return
        if not self._force_mock and self._api_url:
            self._external_available = self._check_external()
        self._loaded = True

    def _check_external(self) -> bool:
        import urllib.request
        import urllib.error
        try:
            req = urllib.request.Request(f"{self._api_url}/docs", method="GET")
            urllib.request.urlopen(req, timeout=2)
            logger.info("External SVS available at %s", self._api_url)
            return True
        except Exception:
            logger.info("External SVS not reachable — using mock")
            return False

    # ------------------------------------------------------------------
    # Core forward
    # ------------------------------------------------------------------

    def _forward(  # type: ignore[override]
        self,
        x: torch.Tensor,
        lyrics: str = "",
        melody_path: str | None = None,
        voice_ref_path: str | None = None,
        **kwargs: Any,
    ) -> torch.Tensor:
        B = x.shape[0]

        if self._external_available:
            return self._forward_external(lyrics, voice_ref_path, x.device)

        return self._mock_synthesize(lyrics, B, x.device)

    # ------------------------------------------------------------------
    # Mock
    # ------------------------------------------------------------------

    def _mock_synthesize(
        self, lyrics: str, batch_size: int, device: torch.device
    ) -> torch.Tensor:
        """Varying-frequency sine wave as placeholder vocal."""
        lines = [l.strip() for l in lyrics.split("\n") if l.strip() and not l.strip().startswith("【")]
        if not lines:
            lines = ["la la la"]

        total_duration = min(len(lines) * 1.5, 60.0)
        sr = 32000
        total_samples = int(total_duration * sr)
        samples_per_line = total_samples // len(lines)
        base_freq = 220

        samples: list[float] = []
        for i in range(len(lines)):
            freq = base_freq * (1.0 + 0.3 * math.sin(i * 0.5))
            for j in range(samples_per_line):
                t = j / sr
                envelope = max(0.0, 1.0 - j / samples_per_line) * 0.5
                samples.append(math.sin(2.0 * math.pi * freq * t) * envelope)

        tensor = torch.tensor(samples[:total_samples], dtype=torch.float32, device=device)
        tensor = tensor.unsqueeze(0).unsqueeze(0)  # (1, 1, T)
        return tensor.expand(batch_size, -1, -1)

    # ------------------------------------------------------------------
    # External API
    # ------------------------------------------------------------------

    def _forward_external(
        self,
        lyrics: str,
        voice_ref_path: str | None,
        device: torch.device,
    ) -> torch.Tensor:
        import os
        import tempfile
        import urllib.request
        import urllib.parse
        import json
        import soundfile as sf

        if not voice_ref_path or not os.path.exists(voice_ref_path):
            raise RuntimeError("External SVS requires a voice reference audio file")

        params = {
            "text": lyrics,
            "text_lang": "zh",
            "ref_audio_path": voice_ref_path,
            "prompt_lang": "zh",
            "text_split_method": "cut5",
            "media_type": "wav",
        }
        url = f"{self._api_url}/tts?{urllib.parse.urlencode(params)}"

        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=120) as resp:
                with open(tmp.name, "wb") as f:
                    f.write(resp.read())

            audio, sr = sf.read(tmp.name)
            tensor = torch.from_numpy(audio).float()
            if tensor.ndim > 1:
                tensor = tensor.mean(dim=1)
            tensor = tensor.unsqueeze(0).unsqueeze(0)  # (1, 1, T)
            return tensor.to(device)
        finally:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    def extra_repr(self) -> str:
        mock_str = "mock" if self._force_mock else ("external" if self._external_available else "mock")
        return f"mode={mock_str}"

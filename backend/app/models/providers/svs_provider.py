"""SVS (Singing Voice Synthesis) provider architecture.

SVSProvider is an abstract interface for converting lyrics text into sung audio.
The business layer depends only on this interface, not on specific model implementations.
"""

import os
import logging
import time
import math
import struct
import wave
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class SVSResult:
    file_path: str
    duration_seconds: float
    provider_name: str  # e.g. "mock", "gpt_sovits", "bert_vits2"


class SVSProvider(ABC):
    """Convert lyrics + optional melody/voice reference into a sung vocal WAV."""

    @abstractmethod
    def synthesize(
        self,
        lyrics: str,
        output_path: str,
        melody_audio_path: str | None = None,
        voice_reference_path: str | None = None,
    ) -> SVSResult:
        ...

    @abstractmethod
    def is_available(self) -> bool:
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        ...


class MockSVSProvider(SVSProvider):
    """Generates a placeholder vocal WAV (sine wave with varying frequency).

    Allows end-to-end pipeline testing without a real SVS model.
    """

    @property
    def name(self) -> str:
        return "mock"

    def is_available(self) -> bool:
        return True

    def synthesize(
        self,
        lyrics: str,
        output_path: str,
        melody_audio_path: str | None = None,
        voice_reference_path: str | None = None,
    ) -> SVSResult:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Parse lyrics into "notes" — each line becomes a tone
        lines = [l.strip() for l in lyrics.split("\n") if l.strip() and not l.strip().startswith("【")]
        if not lines:
            lines = ["la la la"]

        total_duration = min(len(lines) * 1.5, 60.0)
        sample_rate = 32000
        total_samples = int(total_duration * sample_rate)
        samples_per_line = total_samples // len(lines) if lines else total_samples

        base_freq = 220  # A3
        with wave.open(output_path, "w") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)

            for i, _ in enumerate(lines):
                freq = base_freq * (1.0 + 0.3 * math.sin(i * 0.5))
                for j in range(samples_per_line):
                    t = j / sample_rate
                    envelope = max(0.0, 1.0 - j / samples_per_line) * 0.5
                    value = int(8000 * envelope * math.sin(2.0 * math.pi * freq * t))
                    wav.writeframes(struct.pack("<h", max(-32768, min(32767, value))))

        logger.info(f"MockSVS generated: {output_path} ({total_duration:.1f}s, {len(lines)} lines)")
        return SVSResult(
            file_path=output_path,
            duration_seconds=total_duration,
            provider_name="mock",
        )


class ExternalSVSProvider(SVSProvider):
    """Calls an external SVS service (GPT-SoVITS, Bert-VITS2, etc.) via HTTP.

    Configured via Settings.SVS_API_URL (from .env or env var).
    Defaults to http://localhost:9880 if not set.

    Supported API patterns (tried in order):
      1. GET  /tts?text=...&text_language=zh&refer_wav_path=...  (GPT-SoVITS v1/v2 common)
      2. POST /tts  {"text":..., "text_language":"zh", ...}       (JSON API forks)
    Response: raw WAV bytes (audio/wav) or JSON with audio_path/audio_url field.
    """

    def __init__(self, api_url: str | None = None, provider_name: str = "external_svs"):
        if api_url:
            self._api_url = api_url.rstrip("/")
        else:
            try:
                from app.core.config import get_settings
                self._api_url = (get_settings().SVS_API_URL or os.environ.get("SVS_API_URL", "http://localhost:9880")).rstrip("/")
            except Exception:
                self._api_url = os.environ.get("SVS_API_URL", "http://localhost:9880").rstrip("/")
        self._timeout = int(os.environ.get("SVS_API_TIMEOUT", "120"))
        self._provider_name = provider_name

    @property
    def name(self) -> str:
        return self._provider_name

    def is_available(self) -> bool:
        """Check if the SVS service is reachable (fast check, 2s timeout)."""
        import urllib.request
        import urllib.error
        try:
            req = urllib.request.Request(f"{self._api_url}/docs", method="GET")
            urllib.request.urlopen(req, timeout=2)
            return True
        except Exception:
            return False

    def synthesize(
        self,
        lyrics: str,
        output_path: str,
        melody_audio_path: str | None = None,
        voice_reference_path: str | None = None,
    ) -> SVSResult:
        import urllib.request
        import urllib.error
        import urllib.parse
        import json as _json
        import shutil

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # GPT-SoVITS requires a reference audio for voice cloning
        if not voice_reference_path or not os.path.exists(voice_reference_path):
            raise RuntimeError(
                "ExternalSVS requires a voice reference audio for timbre cloning. "
                "Without one, use MockSVSProvider or provide a reference audio."
            )

        # Pattern 1: GET /tts with query params (GPT-SoVITS v2 API)
        params = {
            "text": lyrics,
            "text_lang": "zh",
            "ref_audio_path": voice_reference_path,
            "prompt_lang": "zh",
            "prompt_text": "",  # optional — describes what's in the reference audio
            "text_split_method": "cut5",
            "batch_size": "1",
            "media_type": "wav",
            "streaming_mode": "false",
        }

        url = f"{self._api_url}/tts?{urllib.parse.urlencode(params)}"
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                if resp.status == 200:
                    with open(output_path, "wb") as f:
                        f.write(resp.read())
                    return self._build_result(output_path)
                else:
                    body = resp.read().decode("utf-8", errors="replace")
                    raise RuntimeError(f"SVS API returned HTTP {resp.status}: {body[:500]}")
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace") if e.fp else ""
            logger.debug(f"SVS GET /tts returned HTTP {e.code}: {body[:200]}, trying POST fallback")
        except RuntimeError:
            raise
        except Exception as e:
            logger.debug(f"SVS GET /tts failed: {e}, trying POST fallback")

        # Pattern 2: POST /tts with JSON body (alternative API forks)
        payload = {
            "text": lyrics,
            "text_language": "zh",
        }
        if voice_reference_path:
            payload["refer_wav_path"] = voice_reference_path
        if melody_audio_path:
            payload["aux_ref_audio_path"] = melody_audio_path

        req = urllib.request.Request(
            f"{self._api_url}/tts",
            data=_json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                content_type = resp.headers.get("Content-Type", "")
                raw = resp.read()
                if "json" in content_type:
                    result = _json.loads(raw.decode("utf-8"))
                    if "audio_path" in result:
                        shutil.copy(result["audio_path"], output_path)
                    elif "audio_url" in result:
                        urllib.request.urlretrieve(result["audio_url"], output_path)
                    else:
                        raise RuntimeError(f"SVS API returned unexpected JSON keys: {list(result.keys())}")
                else:
                    with open(output_path, "wb") as f:
                        f.write(raw)
            return self._build_result(output_path)
        except Exception as e:
            raise RuntimeError(
                f"SVS service unreachable at {self._api_url}: {e}. "
                f"Expected GET /tts?text=...&text_language=zh or POST /tts with JSON body."
            ) from e

    def _build_result(self, output_path: str) -> SVSResult:
        import soundfile as sf
        info = sf.info(output_path)
        logger.info(f"ExternalSVS ({self._provider_name}) generated: {output_path} ({info.duration:.1f}s)")
        return SVSResult(
            file_path=output_path,
            duration_seconds=info.duration,
            provider_name=self._provider_name,
        )


# Singleton access
_svs_provider: SVSProvider | None = None


def get_svs_provider() -> SVSProvider:
    global _svs_provider
    if _svs_provider is None:
        external = ExternalSVSProvider()
        if external.is_available():
            _svs_provider = external
            logger.info(f"Using external SVS provider: {external.name}")
        else:
            settings = get_settings()
            if not settings.ENABLE_MOCK_FALLBACK:
                raise RuntimeError(
                    "Mock fallback disabled — no external SVS provider available. "
                    "Set SVS_API_URL in production or enable ENABLE_MOCK_FALLBACK."
                )
            _svs_provider = MockSVSProvider()
            logger.info(f"External SVS unavailable, using mock provider")
    return _svs_provider


def reset_svs_provider():
    global _svs_provider
    _svs_provider = None

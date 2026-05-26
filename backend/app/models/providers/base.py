"""Abstract base classes for AI model providers."""

from abc import ABC, abstractmethod


class ModelProvider(ABC):
    """Base class for any AI model provider (local or API)."""

    @abstractmethod
    def load(self, use_onnx: bool = False, force_mock: bool = False) -> None:
        """Load the model into memory/VRAM. use_onnx=True for ONNX CPU path.
        force_mock=True skips real model loading entirely (mock fallback only)."""

    @abstractmethod
    def unload(self) -> None:
        """Unload the model and free VRAM."""

    @abstractmethod
    def vram_required(self) -> float:
        """Estimated VRAM consumption in GB."""

    @abstractmethod
    def is_loaded(self) -> bool:
        """Check if model is currently loaded."""

    @abstractmethod
    def time_estimate(self, duration_seconds: int = 30) -> float:
        """Estimated inference time in seconds for the given output duration."""

    @abstractmethod
    def supports_gpu(self) -> bool:
        """Return True if this provider has a GPU implementation."""

    @property
    @abstractmethod
    def model_key(self) -> str:
        """Unique model identifier matching model_registry."""


class VocalSepProvider(ModelProvider):
    """Provider for vocal/accompaniment separation."""

    @abstractmethod
    def separate(self, audio_path: str, stem: str = "instrumental") -> str:
        """Separate audio. stem='instrumental' returns accompaniment, stem='vocals' returns vocals."""


class StyleExtractProvider(ModelProvider):
    """Provider for style embedding extraction."""

    @abstractmethod
    def extract(self, audio_path: str) -> list[float]:
        """Extract style embedding vector from audio file."""


class MusicGenProvider(ModelProvider):
    """Provider for music generation from embeddings + text prompt."""

    @abstractmethod
    def generate(self, embedding: list[float], text_prompt: str, reference_audio_path: str | None = None) -> dict:
        """Generate music. Returns dict with 'file_path' and 'duration_seconds'.
        reference_audio_path is used for melody conditioning on musicgen-melody."""

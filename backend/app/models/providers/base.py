"""Abstract base classes for AI model providers."""

from abc import ABC, abstractmethod


class ModelProvider(ABC):
    """Base class for any AI model provider (local or API)."""

    @abstractmethod
    def load(self) -> None:
        """Load the model into memory/VRAM."""

    @abstractmethod
    def unload(self) -> None:
        """Unload the model and free VRAM."""

    @abstractmethod
    def vram_required(self) -> float:
        """Estimated VRAM consumption in GB."""

    @abstractmethod
    def is_loaded(self) -> bool:
        """Check if model is currently loaded."""

    @property
    @abstractmethod
    def model_key(self) -> str:
        """Unique model identifier matching model_registry."""


class VocalSepProvider(ModelProvider):
    """Provider for vocal/accompaniment separation."""

    @abstractmethod
    def separate(self, audio_path: str) -> str:
        """Separate audio. Returns path to instrumental (no-vocals) file."""


class StyleExtractProvider(ModelProvider):
    """Provider for style embedding extraction."""

    @abstractmethod
    def extract(self, audio_path: str) -> list[float]:
        """Extract style embedding vector from audio file."""


class MusicGenProvider(ModelProvider):
    """Provider for music generation from embeddings + text prompt."""

    @abstractmethod
    def generate(self, embedding: list[float], text_prompt: str) -> dict:
        """Generate music. Returns dict with 'file_path' and 'duration_seconds'."""

from app.models.providers.base import ModelProvider, VocalSepProvider, StyleExtractProvider, MusicGenProvider
from app.models.providers.resource_manager import ResourceManager

# Registry imports are lazy — do NOT import get_provider/get_available_providers/
# provider_status at module level because they trigger laion_clap/demucs/torch
# imports which make unauthenticated HuggingFace API calls during startup.
# Use: from app.models.providers.registry import get_provider

__all__ = [
    "ModelProvider", "VocalSepProvider", "StyleExtractProvider", "MusicGenProvider",
    "ResourceManager",
]

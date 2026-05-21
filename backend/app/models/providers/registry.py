"""Provider factory: maps model keys to provider instances."""

import logging
from app.models.providers.base import VocalSepProvider, StyleExtractProvider, MusicGenProvider
from app.models.providers.local_demucs import LocalDemucsProvider
from app.models.providers.local_clap import LocalCLAPProvider
from app.models.providers.local_musicgen import LocalMusicGenProvider
from app.models.model_registry import (
    validate_model_key, get_model_info, CategoryKey,
    VOCAL_SEP_MODELS, STYLE_EXTRACT_MODELS, MUSIC_GEN_MODELS,
)

logger = logging.getLogger(__name__)

# Singleton provider cache (one per model key)
_provider_cache: dict[str, object] = {}


def get_provider(key: str) -> VocalSepProvider | StyleExtractProvider | MusicGenProvider:
    """Get or create a provider for the given model key."""
    if key in _provider_cache:
        return _provider_cache[key]

    provider = _create_provider(key)
    if provider is not None:
        _provider_cache[key] = provider
    return provider


def _create_provider(key: str):
    if validate_model_key("vocal_sep", key):
        return LocalDemucsProvider(key)
    if validate_model_key("style_extract", key):
        return LocalCLAPProvider(key)
    if validate_model_key("music_gen", key):
        return LocalMusicGenProvider(key)
    logger.error(f"Unknown model key: {key}")
    return None


_PACKAGE_AVAILABILITY: dict[str, bool] = {}

def _check_package_installed(import_name: str) -> bool:
    """Check if a Python package is actually importable (cached)."""
    if import_name not in _PACKAGE_AVAILABILITY:
        try:
            __import__(import_name)
            _PACKAGE_AVAILABILITY[import_name] = True
        except ImportError:
            _PACKAGE_AVAILABILITY[import_name] = False
    return _PACKAGE_AVAILABILITY[import_name]


def _is_model_installed(model_key: str) -> bool:
    """Check if the required packages for a model key are available."""
    if validate_model_key("vocal_sep", model_key):
        if model_key.startswith("demucs"):
            return _check_package_installed("demucs")
        return _check_package_installed("spleeter")
    if validate_model_key("style_extract", model_key):
        if model_key.startswith("encodec"):
            return True  # encodec is bundled or lightweight
        return _check_package_installed("laion_clap")
    if validate_model_key("music_gen", model_key):
        if model_key.startswith("audioldm"):
            return _check_package_installed("diffusers")
        return _check_package_installed("audiocraft")
    return False


def get_available_providers(category: CategoryKey) -> list[tuple]:
    """Return list of (ModelInfo, installed) tuples for a category."""
    from app.models.model_registry import ModelInfo
    models_map = {
        "vocal_sep": VOCAL_SEP_MODELS,
        "style_extract": STYLE_EXTRACT_MODELS,
        "music_gen": MUSIC_GEN_MODELS,
    }
    models = models_map.get(category, [])
    result = []
    for m in models:
        installed = _is_model_installed(m.key)
        result.append((m, installed))
    return result


def provider_status() -> dict[str, list[tuple]]:
    """Return full status of all providers (used by /models API to report installed state)."""
    return {
        "vocal_separation": get_available_providers("vocal_sep"),
        "style_extraction": get_available_providers("style_extract"),
        "music_generation": get_available_providers("music_gen"),
    }

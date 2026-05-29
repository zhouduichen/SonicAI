"""Provider factory: maps model keys to provider instances.

CRITICAL: Provider classes are imported lazily because their top-level
imports (laion_clap, demucs, torch/audiocraft) can make unauthenticated
HuggingFace API calls during module load, blocking app startup for 20+ seconds.
"""

import logging
from app.models.providers.base import VocalSepProvider, StyleExtractProvider, MusicGenProvider
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
    # Lazy imports — avoid triggering laion_clap/demucs/torch HuggingFace
    # API calls at module load time (saves ~20s on cold start).
    if validate_model_key("vocal_sep", key):
        from app.models.providers.local_demucs import LocalDemucsProvider
        return LocalDemucsProvider(key)
    if validate_model_key("style_extract", key):
        from app.models.providers.local_clap import LocalCLAPProvider
        return LocalCLAPProvider(key)
    if validate_model_key("music_gen", key):
        from app.models.providers.local_musicgen import LocalMusicGenProvider
        return LocalMusicGenProvider(key)
    logger.error(f"Unknown model key: {key}")
    return None


_PACKAGE_AVAILABILITY: dict[str, bool] = {}

def _check_package_installed(import_name: str) -> bool:
    """Check if a Python package is actually importable (cached).

    Uses importlib.util.find_spec to avoid triggering expensive imports
    (e.g. laion_clap makes HuggingFace API calls during import).
    """
    if import_name not in _PACKAGE_AVAILABILITY:
        try:
            from importlib.util import find_spec
            spec = find_spec(import_name)
            if spec is None:
                _PACKAGE_AVAILABILITY[import_name] = False
            else:
                import os as _os3
                _os3.environ.setdefault("HF_HUB_DISABLE_IMPORT_CHECK", "1")
                # Packages like laion_clap trigger HuggingFace network calls
                # during import (BertTokenizer.from_pretrained). Force offline
                # to prevent timeouts when huggingface.co is unreachable.
                _restore: list[tuple[str, str | None]] = []
                for _e in ("TRANSFORMERS_OFFLINE", "HF_HUB_OFFLINE"):
                    _restore.append((_e, _os3.environ.get(_e)))
                    _os3.environ[_e] = "1"
                try:
                    __import__(import_name)
                    _PACKAGE_AVAILABILITY[import_name] = True
                finally:
                    for _e, _v in _restore:
                        if _v is not None:
                            _os3.environ[_e] = _v
                        else:
                            _os3.environ.pop(_e, None)
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
        return _check_package_installed("transformers")
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

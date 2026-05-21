"""Orchestrator that implements Ollama -> OpenAI -> hardcoded fallback chain."""

import logging
from app.core.config import get_settings
from app.models.providers.ollama_prompt import OllamaPromptProvider
from app.models.providers.openai_prompt import OpenAIPromptProvider

logger = logging.getLogger(__name__)
settings = get_settings()

HARDCODED_SUGGESTIONS = [
    "一首适合深夜开车的 Lo-Fi 音乐",
    "带有爵士钢琴元素的氛围电子乐",
    "节奏轻快的夏日流行音乐",
    "适合冥想的大自然白噪音",
]


def generate_suggestions(style_name: str) -> tuple[list[str], str]:
    """
    Try Ollama -> OpenAI -> hardcoded. Returns (suggestions, provider_name).
    """
    clean_name = style_name.replace("_风格", "").strip()

    # Tier 1: Ollama (primary)
    try:
        provider = OllamaPromptProvider(
            host=settings.OLLAMA_HOST,
            model=settings.OLLAMA_MODEL,
            timeout=settings.SUGGESTION_TIMEOUT_SECONDS,
        )
        suggestions = provider.generate_suggestions(clean_name)
        if len(suggestions) >= 4:
            logger.info(f"Suggestions via Ollama ({settings.OLLAMA_MODEL})")
            return suggestions[:4], "ollama"
    except Exception as e:
        logger.warning(f"Ollama failed: {type(e).__name__}: {e}")

    # Tier 2: OpenAI (fallback)
    if settings.OPENAI_API_KEY:
        try:
            provider = OpenAIPromptProvider(
                base_url=settings.OPENAI_BASE_URL,
                api_key=settings.OPENAI_API_KEY,
                model=settings.OPENAI_MODEL,
                timeout=settings.SUGGESTION_TIMEOUT_SECONDS,
            )
            suggestions = provider.generate_suggestions(clean_name)
            if len(suggestions) >= 4:
                logger.info(f"Suggestions via OpenAI ({settings.OPENAI_MODEL})")
                return suggestions[:4], "openai"
        except Exception as e:
            logger.warning(f"OpenAI failed: {type(e).__name__}: {e}")

    # Tier 3: Hardcoded (last resort)
    logger.info("Falling back to hardcoded suggestions")
    return HARDCODED_SUGGESTIONS.copy(), "fallback"

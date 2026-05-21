"""Ollama prompt provider — calls local Ollama HTTP API."""

import logging
import httpx
from app.models.providers.prompt_base import PromptProvider, PROMPT_TEMPLATE

logger = logging.getLogger(__name__)


class OllamaPromptProvider(PromptProvider):
    def __init__(self, host: str, model: str, timeout: int = 30):
        self._host = host.rstrip("/")
        self._model = model
        self._timeout = timeout

    @property
    def provider_name(self) -> str:
        return "ollama"

    def generate_suggestions(self, style_name: str, count: int = 4) -> list[str]:
        prompt_text = PROMPT_TEMPLATE.format(style_name=style_name)

        url = f"{self._host}/api/generate"
        payload = {
            "model": self._model,
            "prompt": prompt_text,
            "stream": False,
            "format": "json",
        }

        logger.info(f"Ollama request: model={self._model} timeout={self._timeout}s")
        with httpx.Client(timeout=self._timeout) as client:
            response = client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()

        raw = data.get("response", "")
        return self._parse_response(raw)

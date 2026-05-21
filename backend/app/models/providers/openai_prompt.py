"""OpenAI-compatible prompt provider — calls /v1/chat/completions."""

import logging
import httpx
from app.models.providers.prompt_base import PromptProvider, PROMPT_TEMPLATE

logger = logging.getLogger(__name__)


class OpenAIPromptProvider(PromptProvider):
    def __init__(self, base_url: str, api_key: str, model: str, timeout: int = 30):
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._timeout = timeout

    @property
    def provider_name(self) -> str:
        return "openai"

    def generate_suggestions(self, style_name: str, count: int = 4) -> list[str]:
        system_msg = "你是一个专业的音乐创作助手，擅长根据音乐风格生成具体的音乐描述。始终以JSON数组格式回复。"
        user_msg = PROMPT_TEMPLATE.format(style_name=style_name)

        url = f"{self._base_url}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            "temperature": 0.8,
            "max_tokens": 300,
        }

        logger.info(f"OpenAI request: model={self._model}")
        with httpx.Client(timeout=self._timeout) as client:
            response = client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()

        choices = data.get("choices", [])
        if not choices:
            raise ValueError("OpenAI returned empty choices list — content may have been filtered")
        content = choices[0]["message"]["content"]
        return self._parse_response(content)

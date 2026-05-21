"""Abstract base class for LLM-based prompt suggestion providers."""

from abc import ABC, abstractmethod
import json
import re

PROMPT_TEMPLATE = """你是一个音乐创作助手。基于给定的音乐风格名称，生成4个不同的、富有创意的中文音乐描述（用于AI音乐生成器的文本提示词）。

要求：
- 每个描述15-30个汉字
- 包含具体的乐器、情绪、节奏类型
- 描述音乐的场景和氛围
- 4个描述的风格和角度应各不相同
- 直接、具体、富有感染力

风格名称：{style_name}

请严格按照如下JSON数组格式返回，不要包含任何额外解释或markdown标记：
["描述1", "描述2", "描述3", "描述4"]"""


class PromptProvider(ABC):
    """Base for providers that generate text descriptions from a style name."""

    @abstractmethod
    def generate_suggestions(self, style_name: str, count: int = 4) -> list[str]:
        """Return a list of music description strings."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable provider identifier for logging."""

    @staticmethod
    def _parse_response(raw: str) -> list[str]:
        """Robustly extract a JSON array of strings from LLM output."""
        candidates = []

        # Attempt 1: direct JSON parse
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                candidates.append(parsed)
        except json.JSONDecodeError:
            pass

        # Attempt 2: extract from markdown code fences
        for pattern in [r'```json\s*([\s\S]*?)\s*```', r'```\s*([\s\S]*?)\s*```']:
            for match in re.finditer(pattern, raw):
                try:
                    parsed = json.loads(match.group(1).strip())
                    if isinstance(parsed, list):
                        candidates.append(parsed)
                except json.JSONDecodeError:
                    pass

        # Attempt 3: find bracket-enclosed array
        array_match = re.search(r'\[[\s\S]*\]', raw)
        if array_match and not candidates:
            try:
                parsed = json.loads(array_match.group(0))
                if isinstance(parsed, list):
                    candidates.append(parsed)
            except json.JSONDecodeError:
                pass

        # Validate: need at least 4 strings
        for cand in candidates:
            strings = [s for s in cand if isinstance(s, str)]
            if len(strings) >= 4:
                return strings[:4]

        return []

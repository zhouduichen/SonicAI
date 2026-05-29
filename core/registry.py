from __future__ import annotations

from typing import Any, TYPE_CHECKING, Type

if TYPE_CHECKING:
    from models.base import BaseModel


class ModelRegistry:
    _instance: "ModelRegistry | None" = None

    def __new__(cls) -> "ModelRegistry":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._models = {}
        return cls._instance

    def register(self, model_id: str, model_cls: Type["BaseModel"]) -> None:
        if model_id in self._models:
            raise ValueError(f"Model already registered: {model_id}")
        # Lazy import to avoid circular dependency
        from models.base import BaseModel
        if not issubclass(model_cls, BaseModel):
            raise TypeError(f"{model_cls.__name__} must inherit from BaseModel")
        self._models[model_id] = model_cls

    def get(self, model_id: str) -> Type[BaseModel]:
        try:
            return self._models[model_id]
        except KeyError as exc:
            available = ", ".join(sorted(self._models))
            raise KeyError(f"Unknown model_id={model_id}. Available: {available}") from exc

    def create(self, model_id: str, **kwargs: Any) -> BaseModel:
        model_cls = self.get(model_id)
        return model_cls(**kwargs)

    def list_models(self) -> list[str]:
        return sorted(self._models)


registry = ModelRegistry()


def register_model(model_id: str):
    def decorator(model_cls: Type[BaseModel]) -> Type[BaseModel]:
        registry.register(model_id, model_cls)
        return model_cls
    return decorator

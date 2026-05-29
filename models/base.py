from __future__ import annotations

import logging
from abc import ABC, abstractmethod

import torch
import torch.nn as nn

from core.schemas import ModelInput, ModelOutput, TensorSpec

logger = logging.getLogger(__name__)


class BaseModel(nn.Module, ABC):
    """All models inherit from BaseModel.

    Subclasses only implement _forward(). BaseModel.forward() handles:
    - Input shape validation via TensorSpec
    - Debug logging of input/output shapes
    """

    input_spec: TensorSpec | None = None
    output_spec: TensorSpec | None = None

    def __init__(self) -> None:
        super().__init__()
        self.model_name = self.__class__.__name__

    def forward(self, model_input: ModelInput) -> ModelOutput:
        x = model_input.x
        name = self.model_name

        # Validate input shape
        if self.input_spec is not None:
            self.input_spec.validate_shape(x)
        logger.debug("%s input shape=%s", name, tuple(x.shape))

        # Subclass forward — pass metadata as kwargs for models that need
        # extra info (e.g. text prompt for MusicGen, lyrics for SVS).
        y = self._forward(x, **model_input.metadata)

        # Validate output shape
        if self.output_spec is not None:
            self.output_spec.validate_shape(y)
        logger.debug("%s output shape=%s", name, tuple(y.shape))

        return ModelOutput(y=y)

    @abstractmethod
    def _forward(self, x: torch.Tensor, **kwargs) -> torch.Tensor:
        """Subclasses implement the actual tensor-to-tensor computation here.

        ``kwargs`` carries entries from ``ModelInput.metadata`` so models that
        need non-tensor inputs (text, flags) can access them without overriding
        ``forward()``.
        """

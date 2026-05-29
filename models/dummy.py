from __future__ import annotations

import torch
import torch.nn as nn

from core.schemas import TensorSpec
from models.base import BaseModel
from core.registry import register_model


@register_model("dummy")
class DummyModel(BaseModel):
    """Dummy model for smoke-testing the architecture.

    Applies a learnable linear projection: BCT -> BCT.
    """

    input_spec = TensorSpec(layout="BCT", channels=None)
    output_spec = TensorSpec(layout="BCT", channels=None)

    def __init__(self, channels: int = 4, hidden_dim: int = 16) -> None:
        super().__init__()
        self.input_proj = nn.Linear(channels, hidden_dim)
        self.output_proj = nn.Linear(hidden_dim, channels)
        self._channels = channels

    def _forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, C, T)
        x = x.transpose(1, 2)                 # (B, T, C) for Linear
        x = torch.relu(self.input_proj(x))
        x = self.output_proj(x)
        x = x.transpose(1, 2)                 # (B, C, T)
        return x

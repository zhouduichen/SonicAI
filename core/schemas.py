from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

import torch

TensorLayout = Literal["BCT", "BFT"]


@dataclass(frozen=True)
class TensorSpec:
    layout: TensorLayout
    channels: int | None = None
    freqs: int | None = None

    def validate_shape(self, x: torch.Tensor) -> None:
        if x.ndim != 3:
            raise ValueError(f"Expected 3D tensor {self.layout}, got shape={tuple(x.shape)}")

        batch, dim, time = x.shape

        if batch <= 0 or time <= 0:
            raise ValueError(f"Invalid batch/time dimension: shape={tuple(x.shape)}")

        if self.layout == "BCT" and self.channels is not None and dim != self.channels:
            raise ValueError(f"Expected channels={self.channels}, got shape={tuple(x.shape)}")

        if self.layout == "BFT" and self.freqs is not None and dim != self.freqs:
            raise ValueError(f"Expected freqs={self.freqs}, got shape={tuple(x.shape)}")


@dataclass
class ModelInput:
    x: torch.Tensor
    sample_rate: int | None = None
    layout: TensorLayout = "BCT"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ModelOutput:
    y: torch.Tensor
    loss: torch.Tensor | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

from __future__ import annotations

import logging
from typing import Any

import torch
from torch.utils.data import DataLoader

from core.schemas import ModelInput, ModelOutput
from models.base import BaseModel

logger = logging.getLogger(__name__)


@torch.no_grad()
def predict(
    model: BaseModel,
    x: torch.Tensor,
    device: torch.device | None = None,
    **metadata: Any,
) -> ModelOutput:
    """Run a single forward pass. Returns ModelOutput."""
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model.eval()
    model.to(device)

    model_input = ModelInput(x=x.to(device), metadata=metadata)
    output = model(model_input)
    return output


@torch.no_grad()
def evaluate(
    model: BaseModel,
    loader: DataLoader,
    device: torch.device | None = None,
) -> dict[str, float]:
    """Run evaluation over a DataLoader. Returns {'loss': avg_loss}."""
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model.eval()
    model.to(device)
    total_loss = 0.0

    for batch in loader:
        x = batch["x"].to(device)
        target = batch.get("y", x).to(device)

        output = predict(model, x, device)
        if output.loss is not None:
            loss = output.loss
        else:
            loss = torch.nn.functional.mse_loss(output.y, target)
        total_loss += loss.item()

    avg_loss = total_loss / max(len(loader), 1)
    logger.info("Evaluation complete | Avg Loss: %.4f", avg_loss)
    return {"loss": avg_loss}

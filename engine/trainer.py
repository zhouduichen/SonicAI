from __future__ import annotations

import logging
from typing import Any

import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from core.schemas import ModelInput
from models.base import BaseModel

logger = logging.getLogger(__name__)


def train_one_epoch(
    model: BaseModel,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
    epoch: int,
    log_interval: int = 10,
) -> dict[str, float]:
    """Run one training epoch. Returns {'loss': avg_loss}."""
    model.train()
    total_loss = 0.0
    num_batches = len(loader) if hasattr(loader, "__len__") else None
    batch_idx = 0

    for batch_idx, batch in enumerate(loader):
        x = batch["x"].to(device)
        target = batch.get("y", x).to(device)  # default: denoising objective

        model_input = ModelInput(x=x)
        output = model(model_input)

        loss = criterion(output.y, target)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        total_loss += loss.item()

        if log_interval > 0 and batch_idx % log_interval == 0:
            total_str = f"/{num_batches}" if num_batches is not None else ""
            logger.info(
                "Epoch %d | Batch %d%s | Loss: %.4f",
                epoch, batch_idx, total_str, loss.item(),
            )

    divisor = num_batches if num_batches is not None else (batch_idx + 1)
    avg_loss = total_loss / divisor
    logger.info("Epoch %d complete | Avg Loss: %.4f", epoch, avg_loss)
    return {"loss": avg_loss}


def train(
    model: BaseModel,
    train_loader: DataLoader,
    criterion: nn.Module | None = None,
    optimizer: torch.optim.Optimizer | None = None,
    num_epochs: int = 10,
    device: torch.device | None = None,
    **kwargs: Any,
) -> dict[str, list[float]]:
    """Full training loop. Returns {'loss': [epoch_losses]}."""
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if criterion is None:
        criterion = nn.MSELoss()
    if optimizer is None:
        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

    model.to(device)
    history: dict[str, list[float]] = {"loss": []}

    for epoch in range(1, num_epochs + 1):
        metrics = train_one_epoch(
            model, train_loader, criterion, optimizer, device, epoch, **kwargs
        )
        for k, v in metrics.items():
            history.setdefault(k, []).append(v)

    return history

#!/usr/bin/env python3
"""Entry point: read config, load model, run training or inference."""

from __future__ import annotations

import logging
import sys
from typing import Any

import torch
from torch.utils.data import DataLoader, TensorDataset

from configs.default import INFER_CONFIG, TRAIN_CONFIG
from core.registry import registry
from core.schemas import ModelInput

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-20s | %(levelname)-5s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")


def _resolve_device(cfg_device: str) -> torch.device:
    if cfg_device == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    return torch.device(cfg_device)


class _DictDataset(torch.utils.data.Dataset):
    """Wrapper that yields dicts so DataLoader is reusable across epochs."""

    def __init__(self, x: torch.Tensor, y: torch.Tensor) -> None:
        self.x = x
        self.y = y

    def __len__(self) -> int:
        return len(self.x)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        return {"x": self.x[idx], "y": self.y[idx]}


def _make_dummy_data(
    num_samples: int, channels: int, seq_len: int, batch_size: int
) -> DataLoader:
    x = torch.randn(num_samples, channels, seq_len)
    y = x.clone()  # identity target (denoising-style)
    dataset = _DictDataset(x, y)
    return DataLoader(dataset, batch_size=batch_size, shuffle=True)


def run_train(config: dict[str, Any]) -> None:
    from engine.trainer import train

    model_id = config["model_id"]
    model_kwargs = config.get("model_kwargs", {})
    train_cfg = config.get("train", {})
    device = _resolve_device(config.get("device", "auto"))

    logger.info("Loading model: %s with kwargs=%s", model_id, model_kwargs)
    model = registry.create(model_id, **model_kwargs)
    logger.info("Model created: %s", type(model).__name__)

    num_samples = train_cfg.get("num_samples", 64)
    seq_len = train_cfg.get("seq_len", 128)
    batch_size = train_cfg.get("batch_size", 8)
    num_epochs = train_cfg.get("num_epochs", 5)
    lr = train_cfg.get("learning_rate", 1e-3)

    # Derive channels from model's input_spec, fall back to kwargs
    if model.input_spec is not None and model.input_spec.channels is not None:
        channels = model.input_spec.channels
    else:
        channels = model_kwargs.get("channels", 4)
    loader = _make_dummy_data(num_samples, channels, seq_len, batch_size)

    history = train(
        model=model,
        train_loader=loader,
        num_epochs=num_epochs,
        device=device,
        optimizer=torch.optim.Adam(model.parameters(), lr=lr),
        log_interval=train_cfg.get("log_interval", 10),
    )

    logger.info("Training complete. Final loss: %.4f", history["loss"][-1])


def run_infer(config: dict[str, Any]) -> None:
    from engine.inferencer import predict

    model_id = config["model_id"]
    model_kwargs = config.get("model_kwargs", {})
    infer_cfg = config.get("infer", {})
    device = _resolve_device(config.get("device", "auto"))

    logger.info("Loading model: %s with kwargs=%s", model_id, model_kwargs)
    model = registry.create(model_id, **model_kwargs)
    model.to(device)
    model.eval()

    seq_len = infer_cfg.get("seq_len", 128)
    # Derive channels from model's input_spec, fall back to kwargs
    if model.input_spec is not None and model.input_spec.channels is not None:
        channels = model.input_spec.channels
    else:
        channels = model_kwargs.get("channels", 4)
    x = torch.randn(1, channels, seq_len)

    output = predict(model, x, device)
    logger.info("Inference output shape=%s", tuple(output.y.shape))


def main() -> None:
    # Auto-import models to trigger registration
    import models  # noqa: F401

    registry.list_models()

    # Pick config based on mode
    config = TRAIN_CONFIG if len(sys.argv) < 2 or sys.argv[1] == "train" else INFER_CONFIG

    logger.info("Registered models: %s", registry.list_models())
    logger.info("Mode: %s", config["mode"])

    if config["mode"] == "train":
        run_train(config)
    else:
        run_infer(config)


if __name__ == "__main__":
    main()

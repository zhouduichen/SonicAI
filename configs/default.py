"""Default configuration dictionary. No Hydra/dataclass overhead."""

from typing import Any

TRAIN_CONFIG: dict[str, Any] = {
    "mode": "train",
    "model_id": "dummy",
    "model_kwargs": {"channels": 4, "hidden_dim": 16},
    "train": {
        "num_epochs": 5,
        "batch_size": 8,
        "learning_rate": 1e-3,
        "log_interval": 5,
        "num_samples": 64,
        "seq_len": 128,
    },
    "device": "auto",  # "auto" | "cpu" | "cuda"
}

INFER_CONFIG: dict[str, Any] = {
    "mode": "infer",
    "model_id": "dummy",
    "model_kwargs": {"channels": 4, "hidden_dim": 16},
    "infer": {
        "batch_size": 1,
        "seq_len": 128,
    },
    "device": "auto",
}

CLAP_INFER_CONFIG: dict[str, Any] = {
    "mode": "infer",
    "model_id": "clap",
    "model_kwargs": {"variant": "clap_laion", "force_mock": True},
    "infer": {
        "batch_size": 1,
        "seq_len": 48000,  # 1 second at 48kHz
    },
    "device": "auto",
}

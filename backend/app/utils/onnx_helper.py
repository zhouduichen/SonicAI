"""ONNX model discovery and caching utilities."""

import os
import json
import logging

logger = logging.getLogger(__name__)

DEFAULT_ONNX_DIR = os.path.expanduser("~/.sonicai/models")


def get_onnx_model_path(model_key: str) -> str | None:
    """Return the ONNX file path for a model key, or None if not installed."""
    manifest_dir = os.environ.get("SONICAI_ONNX_DIR", DEFAULT_ONNX_DIR)
    manifest_path = os.path.join(manifest_dir, "model_manifest.json")

    if not os.path.exists(manifest_path):
        return None

    with open(manifest_path, "r") as f:
        manifest = json.load(f)

    entry = manifest.get(model_key)
    if not entry:
        return None

    model_path = os.path.join(manifest_dir, entry.get("filename", ""))
    if os.path.exists(model_path):
        return model_path
    return None


def is_onnx_installed(model_key: str) -> bool:
    return get_onnx_model_path(model_key) is not None


def any_onnx_installed() -> bool:
    """Check if any ONNX models are installed."""
    manifest_path = os.path.join(DEFAULT_ONNX_DIR, "model_manifest.json")
    if not os.path.exists(manifest_path):
        return False
    with open(manifest_path, "r") as f:
        manifest = json.load(f)
    for entry in manifest.values():
        if os.path.exists(os.path.join(DEFAULT_ONNX_DIR, entry.get("filename", ""))):
            return True
    return False

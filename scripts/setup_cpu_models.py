#!/usr/bin/env python3
"""Download ONNX models for CPU inference into ~/.sonicai/models/."""

import os
import json
import sys
from urllib.request import urlretrieve

ONNX_DIR = os.path.expanduser("~/.sonicai/models")
MANIFEST_PATH = os.path.join(ONNX_DIR, "model_manifest.json")

MODELS = {
    "spleeter_2stems": {
        "filename": "spleeter_2stems_int8.onnx",
        "url": "https://huggingface.co/sonicai/spleeter-onnx/resolve/main/spleeter_2stems_int8.onnx",
        "sha256": "",
        "size_mb": 50,
    },
    "spleeter_5stems": {
        "filename": "spleeter_5stems_int8.onnx",
        "url": "https://huggingface.co/sonicai/spleeter-onnx/resolve/main/spleeter_5stems_int8.onnx",
        "sha256": "",
        "size_mb": 60,
    },
    "clap_laion": {
        "filename": "clap_laion_int8.onnx",
        "url": "https://huggingface.co/sonicai/clap-onnx/resolve/main/clap_laion_int8.onnx",
        "sha256": "",
        "size_mb": 80,
    },
    "encodec_6kbps": {
        "filename": "encodec_6kbps_int8.onnx",
        "url": "https://huggingface.co/sonicai/encodec-onnx/resolve/main/encodec_6kbps_int8.onnx",
        "sha256": "",
        "size_mb": 30,
    },
    "musicgen_small": {
        "filename": "musicgen_small_int8.onnx",
        "url": "https://huggingface.co/sonicai/musicgen-onnx/resolve/main/musicgen_small_int8.onnx",
        "sha256": "",
        "size_mb": 300,
    },
}


def download_with_progress(url: str, dest: str, desc: str):
    """Download a file with a simple progress indicator."""
    print(f"  Downloading {desc}...")

    def _report(count, block_size, total_size):
        if total_size > 0:
            pct = min(count * block_size * 100 // total_size, 100)
            mb = count * block_size // (1024 * 1024)
            total_mb = total_size // (1024 * 1024)
            print(f"\r    {mb}/{total_mb} MB ({pct}%)", end="", flush=True)

    urlretrieve(url, dest, reporthook=_report)
    print()


def main():
    os.makedirs(ONNX_DIR, exist_ok=True)

    existing = {}
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, "r") as f:
            existing = json.load(f)

    print(f"SonicAI ONNX Model Setup")
    print(f"Models directory: {ONNX_DIR}")
    print(f"Models to install: {len(MODELS)}")
    print()

    total_size = sum(m["size_mb"] for m in MODELS.values())
    print(f"Total download size: ~{total_size} MB")
    print()

    manifest = {}
    success = 0

    for model_key, info in MODELS.items():
        dest_path = os.path.join(ONNX_DIR, info["filename"])

        if os.path.exists(dest_path) and model_key in existing:
            print(f"  [{model_key}] Already installed, skipping")
            manifest[model_key] = info
            success += 1
            continue

        try:
            download_with_progress(info["url"], dest_path, info["filename"])
            manifest[model_key] = info
            success += 1
            print(f"  [{model_key}] Done")
        except Exception as e:
            print(f"  [{model_key}] Failed: {e}")

    manifest_data = {
        k: {"filename": v["filename"]}
        for k, v in manifest.items()
    }
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest_data, f, indent=2)

    print()
    print(f"Installed: {success}/{len(MODELS)} models")
    print(f"Manifest: {MANIFEST_PATH}")

    if success == 0:
        print()
        print("No models installed. If all downloads failed, check your network connection.")
        print("You can still use the app in mock mode for UI preview.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

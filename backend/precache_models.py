#!/usr/bin/env python3
"""Pre-download AI model weights during Docker build.

Downloads and caches the medium-tier model set:
  - MusicGen Medium (~3.0 GB) via HuggingFace Hub
  - Demucs MDX Extra (~0.3 GB) via torch.hub
  - CLAP 630k-audioset-best (~1.0 GB) via laion_clap

All models are cached to ~/.cache/ (HuggingFace + torch hub),
which persists in the Docker image layer.
"""

import os
import sys
import time
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("precache")

CACHE_ROOT = os.path.expanduser("~/.cache")


def _dir_size(path: str) -> float:
    total = 0
    for root, dirs, files in os.walk(path):
        for f in files:
            fp = os.path.join(root, f)
            if os.path.exists(fp):
                total += os.path.getsize(fp)
    return total / (1024**3)


def precache_musicgen() -> bool:
    """Download MusicGen Medium from HuggingFace (download-only, no model init)."""
    logger.info("=== MusicGen Medium (facebook/musicgen-medium) ===")
    t0 = time.time()
    from huggingface_hub import snapshot_download

    path = snapshot_download("facebook/musicgen-medium")
    elapsed = time.time() - t0
    size = _dir_size(path)
    logger.info(f"OK — {size:.1f} GB in {elapsed:.0f}s -> {path}")
    return True


def precache_demucs() -> bool:
    """Download Demucs MDX Extra via torch.hub."""
    logger.info("=== Demucs MDX Extra ===")
    t0 = time.time()
    import torch

    torch.hub.load("facebookresearch/demucs", "mdx_extra")
    elapsed = time.time() - t0
    hub_dir = os.path.join(CACHE_ROOT, "torch", "hub")
    size = _dir_size(hub_dir)
    logger.info(f"OK — {size:.1f} GB in {elapsed:.0f}s -> {hub_dir}")
    return True


def precache_clap() -> bool:
    """Download CLAP 630k-audioset-best.pt via laion_clap."""
    logger.info("=== CLAP LAION (630k-audioset-best) ===")
    t0 = time.time()
    import laion_clap

    model = laion_clap.CLAP_Module(enable_fusion=False)
    model.load_ckpt(model_id=1)
    elapsed = time.time() - t0
    hf_dir = os.path.join(CACHE_ROOT, "huggingface")
    size = _dir_size(hf_dir)
    logger.info(f"OK — {size:.1f} GB in {elapsed:.0f}s -> {hf_dir}")
    return True


def main() -> int:
    logger.info("SonicAI Model Pre-caching")
    logger.info(f"Cache root: {CACHE_ROOT}")

    models = [
        ("musicgen_medium", precache_musicgen),
        ("demucs_mdx_extra", precache_demucs),
        ("clap_laion", precache_clap),
    ]

    results = {}
    for name, fn in models:
        try:
            results[name] = "OK" if fn() else "SKIP"
        except Exception as exc:
            logger.error(f"FAILED {name}: {exc}", exc_info=True)
            results[name] = f"FAIL: {exc}"

    logger.info("=== Summary ===")
    for name, status in results.items():
        logger.info(f"  {name}: {status}")

    # Show total cache size
    for label, path in [
        ("huggingface", os.path.join(CACHE_ROOT, "huggingface")),
        ("torch/hub", os.path.join(CACHE_ROOT, "torch", "hub")),
    ]:
        if os.path.exists(path):
            logger.info(f"  {label}: {_dir_size(path):.1f} GB")

    failures = sum(1 for v in results.values() if v.startswith("FAIL"))
    if failures:
        logger.warning(f"{failures} model(s) failed — will be downloaded at runtime if needed")
    return 0  # never fail the build


if __name__ == "__main__":
    sys.exit(main())

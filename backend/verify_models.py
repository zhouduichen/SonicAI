#!/usr/bin/env python
"""Check AI model dependencies and print a status table.

Usage: python verify_models.py
"""

import sys
import os

DEPS = {
    "audiocraft": {"import": "audiocraft", "desc": "MusicGen models (facebook/musicgen-*)"},
    "diffusers": {"import": "diffusers", "desc": "AudioLDM / diffusion models"},
    "torch": {"import": "torch", "desc": "PyTorch (GPU/CPU backend)"},
    "transformers": {"import": "transformers", "desc": "HuBERT model for RVC voice training"},
    "soundfile": {"import": "soundfile", "desc": "Audio file I/O"},
    "ffmpeg-python": {"import": "ffmpeg", "desc": "Audio mixing (ffmpeg wrapper)"},
    "onnxruntime": {"import": "onnxruntime", "desc": "ONNX CPU inference runtime"},
    "laion_clap": {"import": "laion_clap", "desc": "CLAP style extraction"},
    "demucs": {"import": "demucs", "desc": "Vocal separation (Demucs)"},
    "redis": {"import": "redis", "desc": "Redis client for Celery broker"},
    "celery": {"import": "celery", "desc": "Async task queue"},
    "httpx": {"import": "httpx", "desc": "HTTP client (LLM lyrics, API calls)"},
}

# RVC submodule check
RVC_ROOT = os.path.join(os.path.dirname(__file__), "app", "services", "rvc")


def check_cuda():
    try:
        import torch
        return torch.cuda.is_available(), torch.cuda.device_count() if torch.cuda.is_available() else 0
    except ImportError:
        return False, 0


def check_ffmpeg_bin():
    import subprocess
    try:
        result = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, timeout=5)
        return result.returncode == 0
    except Exception:
        return False


def check_rvc():
    """Check RVC submodule and HuBERT model."""
    results = []
    # RVC code
    if os.path.isdir(RVC_ROOT):
        infer_mod = os.path.join(RVC_ROOT, "infer", "modules", "vc", "modules.py")
        if os.path.exists(infer_mod):
            results.append(("RVC codebase", "OK", ""))
        else:
            results.append(("RVC codebase", "WARN", "submodule may not be fully checked out"))
    else:
        results.append(("RVC codebase", "MISSING", "git submodule update --init"))

    # HuBERT checkpoint
    hubert_path = os.path.join(RVC_ROOT, "assets", "hubert", "hubert_base.pt")
    if os.path.exists(hubert_path):
        results.append(("HuBERT checkpoint", "OK", hubert_path))
    else:
        results.append(("HuBERT checkpoint", "WARN", "will download from HuggingFace on first use"))

    return results


def main():
    print("=" * 70)
    print("  SonicAI Model Dependency Check")
    print("=" * 70)

    # Python packages
    print("\n[Python Packages]")
    print(f"{'Package':<20} {'Status':<10} {'Description'}")
    print("-" * 60)
    for name, info in DEPS.items():
        try:
            __import__(info["import"])
            status = "OK"
        except ImportError:
            status = "MISSING"
        print(f"  {name:<18} {status:<10} {info['desc']}")

    # CUDA
    print("\n[CUDA / GPU]")
    cuda_ok, count = check_cuda()
    if cuda_ok:
        import torch
        print(f"  CUDA available: YES ({count} device(s))")
        print(f"  PyTorch version: {torch.__version__}")
        for i in range(count):
            print(f"  GPU {i}: {torch.cuda.get_device_name(i)}")
    else:
        print(f"  CUDA available: NO (CPU-only mode)")

    # ffmpeg binary
    print("\n[System Tools]")
    ffmpeg_ok = check_ffmpeg_bin()
    print(f"  ffmpeg: {'OK' if ffmpeg_ok else 'MISSING — install ffmpeg for audio mixing'}")

    # RVC
    print("\n[RVC Voice Training]")
    for name, status, detail in check_rvc():
        print(f"  {name}: {status}{' — ' + detail if detail else ''}")

    # Summary
    print("\n" + "=" * 70)
    missing = [name for name, info in DEPS.items() if _try_import(info["import"]) is False]
    core_missing = [m for m in missing if m in ("torch", "soundfile")]
    music_missing = [m for m in missing if m in ("audiocraft", "diffusers")]
    voice_missing = [m for m in missing if m in ("transformers", "demucs")]
    async_missing = [m for m in missing if m in ("redis", "celery")]

    if not missing:
        print("  All packages installed. Full functionality available.")
    else:
        print(f"  {len(missing)} package(s) missing:")
        if core_missing:
            print(f"    Core:       {', '.join(core_missing)} — basic audio operations will fail")
        if music_missing:
            print(f"    Music Gen:  {', '.join(music_missing)} — will use mock (sine tone) fallback")
        if voice_missing:
            print(f"    Voice:      {', '.join(voice_missing)} — RVC voice training will fail")
        if async_missing:
            print(f"    Async:      {', '.join(async_missing)} — only sync mode available")

    if not ffmpeg_ok:
        print("  WARNING: ffmpeg not found — audio mixing will fail")

    print("=" * 70)

    return 0 if not (core_missing or music_missing) else 1


def _try_import(name: str) -> bool:
    try:
        __import__(DEPS[name]["import"])
        return True
    except ImportError:
        return False


if __name__ == "__main__":
    sys.exit(main())

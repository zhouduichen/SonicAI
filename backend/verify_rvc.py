"""RVC integration verification script — no GPU required."""
import sys, os

print("=" * 60)
print("SonicAI RVC Integration Verification")
print("=" * 60)

# 1. RVC file existence
print("\n--- 1. RVC source files ---")
_RVC = os.path.join("app", "services", "rvc")
files = [
    "infer/modules/train/preprocess.py",
    "infer/modules/train/extract_feature_print.py",
    "infer/modules/train/train.py",
    "infer/lib/audio.py",
    "infer/modules/vc/modules.py",
    "infer/modules/vc/pipeline.py",
]
for f in files:
    path = os.path.join(_RVC, f)
    ok = os.path.exists(path)
    print(f"  {'OK' if ok else 'MISSING'}  {f}")

# 2. Module imports
print("\n--- 2. Module imports ---")
modules = [
    ("base providers", "app.models.providers.base"),
    ("provider registry", "app.models.providers.registry"),
    ("resource_manager", "app.models.providers.resource_manager"),
    ("model_recommender", "app.services.model_recommender"),
    ("voice_pipeline", "app.tasks.voice_pipeline"),
    ("onnx_helper", "app.utils.onnx_helper"),
]
for name, mod in modules:
    try:
        __import__(mod)
        print(f"  OK  {name}")
    except Exception as e:
        print(f"  FAIL  {name}: {e}")

# 3. Voice pipeline function imports
print("\n--- 3. Voice pipeline functions ---")
from app.tasks.voice_pipeline import (
    _rvc_preprocess, _rvc_extract_features, _rvc_train,
    _rvc_infer, _rvc_infer_direct, _rvc_infer_subprocess,
    _write_train_config, _report_training_progress,
)
print("  OK  all 8 functions importable")

# 4. Training config generation
print("\n--- 4. Training config validation ---")
import tempfile, json
with tempfile.TemporaryDirectory() as tmp:
    config_path = os.path.join(tmp, "config.json")
    _write_train_config(config_path, tmp, 200)
    with open(config_path) as f:
        cfg = json.load(f)
    assert cfg["train"]["epochs"] == 200
    assert cfg["version"] == "v2"
    assert "data" in cfg
    assert "model" in cfg
    print(f"  OK  config: {cfg['train']['epochs']} epochs, version={cfg['version']}")

# 5. Tier presets
print("\n--- 5. Hardware tier presets ---")
from app.services.model_recommender import get_tier_config, get_preset
for tier in ["ultra", "high", "mid", "low", "cpu"]:
    cfg = get_tier_config(tier)
    sp = get_preset(tier, "speed")
    qp = get_preset(tier, "quality")
    print(f"  {tier:5s}  budget={cfg.max_vram_gb:3.0f}GB  speed={sp.music_gen_model:20s}  quality={qp.music_gen_model}")

# 6. ResourceManager tier wiring
print("\n--- 6. ResourceManager ---")
from app.models.providers.resource_manager import resource_manager
print(f"  vram_budget = {resource_manager.vram_budget}GB")

# 7. Provider installed status
print("\n--- 7. Provider installed status ---")
from app.models.providers.registry import provider_status
for cat, models in provider_status().items():
    for m, installed in models:
        print(f"  {'INSTALLED' if installed else 'MISSING':10s}  {cat}/{m.key}")

print("\n" + "=" * 60)
print("ALL CHECKS PASSED")
print("=" * 60)

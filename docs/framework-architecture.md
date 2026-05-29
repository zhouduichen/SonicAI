# ML Framework Architecture

## Directory Layout

```
aimusic/
├── core/          # Framework infrastructure
│   ├── registry.py   ModelRegistry (singleton) + @register_model decorator
│   └── schemas.py    TensorSpec, ModelInput, ModelOutput
├── models/        # Model definitions only (no training loops)
│   ├── base.py       BaseModel — shape validation + metadata→**kwargs bridge
│   ├── dummy.py      @register_model("dummy")
│   ├── clap.py       @register_model("clap")
│   ├── demucs.py     @register_model("demucs")
│   ├── musicgen.py   @register_model("musicgen")
│   └── svs.py        @register_model("svs")
├── engine/        # Training / inference orchestration
│   ├── trainer.py    train() / train_one_epoch()
│   └── inferencer.py predict() / evaluate()
├── configs/
│   └── default.py    Dict-based configs (no Hydra)
├── main.py         # Single entry point, config-driven
└── tests/          # pytest suite (see pytest.ini)
```

## Key Contracts

- Every model inherits `BaseModel` and implements `_forward(x, **kwargs)`.
- `BaseModel.forward()` calls `validate_shape()` → `_forward()` → returns `ModelOutput`.
- `kwargs` carries `ModelInput.metadata` entries (text prompts, lyrics, etc.).
- Models are registered via `@register_model("id")` and instantiated via `registry.create("id", **kwargs)`.
- `input_spec: TensorSpec | None` on the class enables automatic shape validation.

## Acceptance Criteria

```bash
# Fast tests (unit + mock + real models that don't download weights)
python -m pytest tests/ -q -m "not slow"

# Real model smoke tests (require laion_clap, demucs, transformers, soundfile)
python -m pytest tests/ -k "real"
```

Expected: **88 passed / 0 failed** for fast; **6 passed / 0 failed** for real.

## Bug Records

### 1. Training loader generator exhaustion (2026-05-29)

**Root cause:** `_make_dummy_data()` wrapped a `DataLoader` in a generator expression to convert tuples to dicts. Since `train()` reuses the loader across epochs, epoch 2+ saw zero batches → loss=0.0.

**Fix:** Replaced the generator with `_DictDataset` (a `torch.utils.data.Dataset` that yields `{"x": ..., "y": ...}` directly). The `DataLoader` can now be iterated multiple times.

### 2. MusicGen device mismatch (2026-05-29)

**Root cause:** `_forward_hf()` used `x.device` to move processor outputs to the target device. When the calling code passed a CPU tensor (`torch.randn(...)`) to a CUDA-loaded model, the processor outputs landed on CPU while the HF model's embedding weights were on CUDA → `RuntimeError: Expected all tensors to be on the same device`.

**Fix:** Use `next(self._hf_model.parameters()).device` instead of the `x.device` parameter passed from `_forward()`.

**How to prevent recurrence:** When a model wraps an external framework (transformers, etc.), always derive the compute device from the external model's parameters, not from the input tensor.

### 3. Demucs tensor shape in quality test (2026-05-29)

**Root cause:** `torch.stack([mixture, mixture], dim=0)` where mixture was `(1, T)` produced `(2, 1, T)`. An additional `.unsqueeze(0)` produced a 4D tensor `(1, 2, 1, T)`, but `input_spec = TensorSpec(layout="BCT")` expects 3D.

**Fix:** Changed the test to build stereo via `.expand(-1, 2, -1)` on a `(1, 1, T)` base, yielding the correct `(1, 2, T)`.

**How to prevent recurrence:** Always verify test tensor shapes match the model's `input_spec`. The validation runs for every forward pass, so running the test once catches it.

### 4. DemucsModel missing load_model() (2026-05-29)

**Root cause:** `DemucsModel` (unlike `ClapModel` / `MusicGenModel`) had no `load_model()` / `unload_model()` methods. The smoke test assumed they existed.

**Fix:** Added `load_model()` (idempotent, sets `_loaded` flag) and `unload_model()`.

**How to prevent recurrence:** All real models should implement `load_model()` / `unload_model()` for lifecycle consistency.

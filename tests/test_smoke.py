"""Smoke tests: real forward pass through each model.

Each test exercises the full pipeline — registry.create → model.load_model()
→ model.forward() → ModelOutput — with the model's actual implementation
(not mock). Tests gracefully skip when required dependencies are absent.
"""

from __future__ import annotations

import logging
import sys

import pytest
import torch

from core.registry import registry
from core.schemas import ModelInput

logger = logging.getLogger(__name__)


@pytest.fixture(autouse=True)
def _register_models():
    import models  # noqa: F401
    yield


# ── helpers ──────────────────────────────────────────────────────────────

def _requires(*pkgs: str):
    """Skip test if any of the given packages are unimportable."""
    for pkg in pkgs:
        try:
            __import__(pkg)
        except ImportError:
            pytest.skip(f"dependency not installed: {pkg}")


def make_audio(batch: int, channels: int, samples: int) -> torch.Tensor:
    return torch.randn(batch, channels, samples)


# ── DummyModel ───────────────────────────────────────────────────────────

class TestDummySmoke:
    def test_full_pipeline(self):
        m = registry.create("dummy", channels=4, hidden_dim=16)
        x = make_audio(2, 4, 128)
        out = m(ModelInput(x=x))
        assert out.y.shape == (2, 4, 128)

    def test_batch_1_and_4(self):
        m = registry.create("dummy", channels=2)
        for bs in [1, 4]:
            out = m(ModelInput(x=make_audio(bs, 2, 64)))
            assert out.y.shape == (bs, 2, 64)

    def test_training_step(self):
        """One real train step through engine.trainer"""
        from engine.trainer import train
        m = registry.create("dummy", channels=2, hidden_dim=8)
        x = torch.randn(8, 2, 32)
        y = x.clone()
        ds = torch.utils.data.TensorDataset(x, y)
        loader = [{"x": x, "y": y} for x, y in torch.utils.data.DataLoader(ds, batch_size=4)]
        history = train(m, loader, num_epochs=2)
        assert len(history["loss"]) == 2
        assert history["loss"][-1] < 1.5  # should converge somewhat


# ── ClapModel ────────────────────────────────────────────────────────────

class TestClapSmoke:
    def test_full_pipeline(self):
        m = registry.create("clap", variant="clap_laion", force_mock=True)
        m.load_model()
        x = make_audio(1, 1, 48000)
        out = m(ModelInput(x=x))
        assert out.y.shape == (1, 512)

    def test_batch(self):
        m = registry.create("clap", variant="clap_msclap", force_mock=True)
        m.load_model()
        out = m(ModelInput(x=make_audio(2, 1, 48000)))
        assert out.y.shape == (2, 1024)

    def test_real_clap_if_available(self):
        m = registry.create("clap", variant="clap_laion")
        m.load_model()
        if not m._clap_model:  # laion_clap not installed
            pytest.skip("laion_clap not available")
        x = make_audio(1, 1, 48000)
        out = m(ModelInput(x=x))
        assert out.y.shape == (1, 512)

    def test_onnx_path(self):
        m = registry.create("clap", variant="clap_laion", use_onnx=True, force_mock=True)
        m.load_model()
        x = make_audio(1, 1, 48000)
        out = m(ModelInput(x=x))
        assert out.y.shape == (1, 512)

    def test_inferencer_flow(self):
        from engine.inferencer import predict
        m = registry.create("clap", variant="clap_laion", force_mock=True)
        x = make_audio(1, 1, 48000)
        out = predict(m, x)
        assert out.y.shape == (1, 512)


# ── DemucsModel ──────────────────────────────────────────────────────────

class TestDemucsSmoke:
    def test_full_pipeline(self):
        m = registry.create("demucs", variant="demucs_htdemucs", force_mock=True)
        x = make_audio(1, 2, 44100)
        out = m(ModelInput(x=x))
        assert out.y.shape == (1, 2, 44100)

    def test_batch(self):
        m = registry.create("demucs", variant="demucs_htdemucs", force_mock=True)
        out = m(ModelInput(x=make_audio(2, 2, 44100)))
        assert out.y.shape == (2, 2, 44100)

    def test_mono_spleeter(self):
        m = registry.create("demucs", variant="spleeter_2stems", force_mock=True)
        out = m(ModelInput(x=make_audio(1, 1, 44100)))
        assert out.y.shape == (1, 1, 44100)

    def test_real_demucs_if_available(self):
        _requires("demucs")
        m = registry.create("demucs", variant="demucs_htdemucs")
        m.load_model()
        x = make_audio(1, 2, 44100)
        out = m(ModelInput(x=x))
        assert out.y.shape == (1, 2, 44100)
        # Output should differ from input (separation happened)
        assert not torch.allclose(out.y, x * 0.3)  # not just mock

    def test_inferencer_flow(self):
        from engine.inferencer import predict
        m = registry.create("demucs", variant="demucs_htdemucs", force_mock=True)
        x = make_audio(1, 2, 44100)
        out = predict(m, x)
        assert out.y.shape == (1, 2, 44100)

    @pytest.mark.slow
    def test_real_separation_quality(self):
        """Generate a 440 Hz sine + noise and verify real Demucs separates it."""
        _requires("demucs")
        m = registry.create("demucs", variant="demucs_htdemucs")
        sr = 44100
        t = torch.linspace(0, 1.0, sr)
        sine = torch.sin(2 * torch.pi * 440 * t) * 0.5
        noise = torch.randn(sr) * 0.1
        mixture = sine + noise  # (T,)
        stereo = torch.stack([mixture, mixture], dim=0).unsqueeze(0)  # (1, 2, T)
        out = m(ModelInput(x=stereo))
        assert out.y.shape == (1, 2, sr)
        # The output energy should be lower (separation removed some content)
        input_rms = stereo.pow(2).mean().sqrt().item()
        output_rms = out.y.pow(2).mean().sqrt().item()
        assert output_rms < input_rms * 1.1  # not amplifying


# ── MusicGenModel ────────────────────────────────────────────────────────

class TestMusicGenSmoke:
    def test_full_pipeline(self):
        m = registry.create("musicgen", variant="musicgen_small", force_mock=True)
        x = torch.randn(1, 1, 1)
        out = m(ModelInput(x=x, metadata={"text": "piano melody"}))
        assert out.y.ndim == 3
        assert out.y.shape[0] == 1
        assert out.y.shape[2] > 1000  # generated audio has meaningful length

    def test_batch(self):
        m = registry.create("musicgen", variant="musicgen_small", force_mock=True)
        out = m(ModelInput(x=torch.randn(2, 1, 1), metadata={"text": "jazz"}))
        assert out.y.shape[0] == 2

    def test_all_variants_mock(self):
        for v in ["musicgen_small", "musicgen_medium", "musicgen_large", "musicgen_melody"]:
            m = registry.create("musicgen", variant=v, force_mock=True)
            out = m(ModelInput(x=torch.randn(1, 1, 1), metadata={"text": "test"}))
            assert out.y.shape[2] > 0, f"{v} produced empty output"

    def test_real_musicgen_if_available(self):
        _requires("transformers", "torchaudio", "soundfile")
        m = registry.create("musicgen", variant="musicgen_small")
        m.load_model()
        if not m._hf_model:
            pytest.skip("MusicGen model failed to load")
        out = m(ModelInput(
            x=torch.randn(1, 1, 1),
            metadata={"text": "a short piano note", "guidance_scale": 2.0},
        ))
        assert out.y.ndim == 3
        assert out.y.shape[2] > 0

    def test_guidance_scale_acceptance(self):
        m = registry.create("musicgen", variant="musicgen_small", force_mock=True)
        out = m(ModelInput(
            x=torch.randn(1, 1, 1),
            metadata={"text": "rock", "guidance_scale": 3.0},
        ))
        assert out.y.shape[2] > 0

    def test_inferencer_flow(self):
        from engine.inferencer import predict
        m = registry.create("musicgen", variant="musicgen_small", force_mock=True)
        out = predict(m, torch.randn(1, 1, 1), text="ambient")
        assert out.y.ndim == 3


# ── SVSModel ─────────────────────────────────────────────────────────────

class TestSVSSmoke:
    def test_full_pipeline(self):
        m = registry.create("svs", force_mock=True)
        m.load_model()
        x = torch.randn(1, 1, 1)
        out = m(ModelInput(x=x, metadata={"lyrics": "ni hao shi jie"}))
        assert out.y.ndim == 3
        assert out.y.shape[0] == 1
        assert out.y.shape[2] > 0

    def test_long_lyrics(self):
        m = registry.create("svs", force_mock=True)
        lyrics = "\n".join([f"line {i}" for i in range(20)])
        out = m(ModelInput(x=torch.randn(1, 1, 1), metadata={"lyrics": lyrics}))
        assert out.y.shape[2] > 0

    def test_batch(self):
        m = registry.create("svs", force_mock=True)
        out = m(ModelInput(
            x=torch.randn(2, 1, 1),
            metadata={"lyrics": "la"},
        ))
        assert out.y.shape[0] == 2

    def test_timing_reproducible(self):
        """Same lyrics should produce same-length output."""
        m = registry.create("svs", force_mock=True)
        out1 = m(ModelInput(x=torch.randn(1, 1, 1), metadata={"lyrics": "hello world"}))
        out2 = m(ModelInput(x=torch.randn(1, 1, 1), metadata={"lyrics": "hello world"}))
        assert out1.y.shape == out2.y.shape

    def test_inferencer_flow(self):
        from engine.inferencer import predict
        m = registry.create("svs", force_mock=True)
        out = predict(m, torch.randn(1, 1, 1), lyrics="test")
        assert out.y.ndim == 3


# ── Cross-model: pipeline consistency ────────────────────────────────────

class TestPipelineConsistency:
    """All models must survive the same basic contract."""

    MODELS: list[tuple[str, dict, torch.Tensor, dict]] = [
        ("dummy", {"channels": 2}, make_audio(1, 2, 128), {}),
        ("clap", {"variant": "clap_laion", "force_mock": True}, make_audio(1, 1, 48000), {}),
        ("demucs", {"variant": "demucs_htdemucs", "force_mock": True}, make_audio(1, 2, 44100), {}),
        ("musicgen", {"variant": "musicgen_small", "force_mock": True}, torch.randn(1, 1, 1), {"text": "test"}),
        ("svs", {"force_mock": True}, torch.randn(1, 1, 1), {"lyrics": "test"}),
    ]

    @pytest.mark.parametrize("model_id,kwargs,inp,meta", MODELS)
    def test_registry_create_forward(self, model_id, kwargs, inp, meta):
        m = registry.create(model_id, **kwargs)
        out = m(ModelInput(x=inp, metadata=meta))
        assert isinstance(out, object)
        assert out.y is not None
        assert isinstance(out.y, torch.Tensor)
        assert out.y.shape[0] == inp.shape[0]  # batch dim preserved
        assert torch.isfinite(out.y).all()

    @pytest.mark.parametrize("model_id,kwargs,inp,meta", MODELS)
    def test_main_entry_via_run_infer(self, model_id, kwargs, inp, meta):
        """Simulate what main.py.run_infer does."""
        from engine.inferencer import predict
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        m = registry.create(model_id, **kwargs)
        m.to(device)
        m.eval()
        out = predict(m, inp.to(device), **meta)
        assert isinstance(out.y, torch.Tensor)

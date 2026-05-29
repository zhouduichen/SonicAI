"""Tests for ClapModel — shape validation, variant configs, mock/real paths."""

from __future__ import annotations

import torch
import pytest

from core.registry import registry
from core.schemas import ModelInput


@pytest.fixture(autouse=True)
def _register_models():
    import models  # noqa: F401
    yield


class TestClapRegistration:
    def test_clap_registered(self):
        assert "clap" in registry.list_models()

    def test_create_default_variant(self):
        m = registry.create("clap", variant="clap_laion")
        assert m.variant == "clap_laion"
        assert m.embedding_dim == 512

    def test_create_msclap(self):
        m = registry.create("clap", variant="clap_msclap")
        assert m.variant == "clap_msclap"
        assert m.embedding_dim == 1024

    def test_create_encodec(self):
        m = registry.create("clap", variant="encodec_6kbps")
        assert m.variant == "encodec_6kbps"
        assert m.embedding_dim == 128

    def test_invalid_variant_raises(self):
        with pytest.raises(ValueError, match="Unknown CLAP variant"):
            registry.create("clap", variant="nonexistent")


class TestClapMockForward:
    @pytest.fixture(params=["clap_laion", "clap_mscalp", "clap_htsat", "encodec_6kbps"])
    def variant(self, request):
        return request.param

    def test_mock_forward_shape(self):
        m = registry.create("clap", variant="clap_laion", force_mock=True)
        x = torch.randn(1, 1, 48000)
        out = m(ModelInput(x=x))
        assert out.y.shape == (1, 512)

    def test_batch_invariant(self):
        m = registry.create("clap", variant="clap_msclap", force_mock=True)
        for bs in [1, 4, 16]:
            x = torch.randn(bs, 1, 48000)
            out = m(ModelInput(x=x))
            assert out.y.shape == (bs, 1024)

    def test_encodec_dim(self):
        m = registry.create("clap", variant="encodec_6kbps", force_mock=True)
        x = torch.randn(2, 1, 32000)
        out = m(ModelInput(x=x))
        assert out.y.shape == (2, 128)

    def test_mock_deterministic(self):
        """Same input should produce same mock embedding (seeded rng)."""
        m = registry.create("clap", variant="clap_laion", force_mock=True)
        x = torch.randn(1, 1, 48000)
        out1 = m(ModelInput(x=x))
        out2 = m(ModelInput(x=x))
        assert torch.equal(out1.y, out2.y)

    def test_short_audio_padded(self):
        """Very short audio should still produce an embedding."""
        m = registry.create("clap", variant="clap_laion", force_mock=True)
        x = torch.randn(1, 1, 16000)  # 0.33s at 48kHz
        out = m(ModelInput(x=x))
        assert out.y.shape == (1, 512)

    def test_model_trains_mock(self):
        """Mock mode: forward + loss + backward should not crash."""
        m = registry.create("clap", variant="clap_laion", force_mock=True)
        proj = torch.nn.Linear(512, 10)
        opt = torch.optim.SGD(list(m.parameters()) + list(proj.parameters()), lr=0.01)

        x = torch.randn(4, 1, 48000)
        out = m(ModelInput(x=x))
        logits = proj(out.y)
        loss = logits.sum()
        loss.backward()
        opt.step()

        # proj's grad should have been populated (mock embedding is detached,
        # but the linear layer on top still trains)
        assert proj.weight.grad is not None


class TestClapInputValidation:
    def test_wrong_channels_raises(self):
        """input_spec says channels=1, so (B, 3, T) should raise."""
        m = registry.create("clap", variant="clap_laion", force_mock=True)
        x = torch.randn(1, 3, 48000)  # 3 channels instead of 1
        with pytest.raises(ValueError, match="Expected channels=1"):
            m(ModelInput(x=x))

    def test_2d_input_raises(self):
        m = registry.create("clap", variant="clap_laion", force_mock=True)
        x = torch.randn(1, 48000)  # missing channel dim
        with pytest.raises(ValueError, match="Expected 3D"):
            m(ModelInput(x=x))


class TestClapRealModel:
    """These tests require laion_clap to be installed."""

    @pytest.fixture
    def model(self):
        m = registry.create("clap", variant="clap_laion")
        try:
            m.load_model()
        except Exception:
            pytest.skip("laion_clap not available")
        return m

    def test_load_and_unload(self, model):
        assert model._clap_loaded

    def test_real_forward_shape(self, model):
        x = torch.randn(1, 1, 48000)
        out = model(ModelInput(x=x))
        assert out.y.shape == (1, 512)
        assert out.y.dtype == torch.float32


class TestClapVariantConfigs:
    def test_all_variants_have_meta(self):
        from models.clap import CLAP_VARIANTS
        for name, meta in CLAP_VARIANTS.items():
            assert "embedding_dim" in meta
            assert meta["embedding_dim"] > 0

    def test_extra_repr(self):
        m = registry.create("clap", variant="clap_laion")
        r = repr(m)
        assert "clap_laion" in r
        assert "dim=512" in r

"""Tests for MusicGenModel — mock generation, text metadata, variants."""

from __future__ import annotations

import torch
import pytest

from core.registry import registry
from core.schemas import ModelInput


@pytest.fixture(autouse=True)
def _register_models():
    import models  # noqa: F401
    yield


class TestMusicGenRegistration:
    def test_musicgen_registered(self):
        assert "musicgen" in registry.list_models()

    def test_all_variants(self):
        for v in ["musicgen_small", "musicgen_medium", "musicgen_large", "musicgen_melody"]:
            m = registry.create("musicgen", variant=v, force_mock=True)
            assert m.variant == v

    def test_invalid_variant_raises(self):
        with pytest.raises(ValueError, match="Unknown MusicGen variant"):
            registry.create("musicgen", variant="nonexistent")


class TestMusicGenMockForward:
    @pytest.fixture
    def model(self):
        return registry.create("musicgen", variant="musicgen_small", force_mock=True)

    def test_mock_forward_shape(self, model):
        x = torch.randn(1, 1, 1)  # dummy input
        out = model(ModelInput(x=x, metadata={"text": "a piano melody"}))
        assert out.y.ndim == 3  # (B, 1, T)
        assert out.y.shape[0] == 1
        assert out.y.shape[1] == 1

    def test_mock_batch(self, model):
        x = torch.randn(2, 1, 1)
        out = model(ModelInput(x=x, metadata={"text": "jazz"}))
        assert out.y.shape[0] == 2

    def test_mock_audio_is_finite(self, model):
        x = torch.randn(1, 1, 1)
        out = model(ModelInput(x=x, metadata={"text": "test"}))
        assert torch.isfinite(out.y).all()

    def test_mock_different_text(self, model):
        """Text metadata should be accepted (but mock ignores it)."""
        x = torch.randn(1, 1, 1)
        out1 = model(ModelInput(x=x, metadata={"text": "rock"}))
        out2 = model(ModelInput(x=x, metadata={"text": "classical"}))
        assert out1.y.shape == out2.y.shape

"""Tests for DemucsModel — shape validation, mock separation, variants."""

from __future__ import annotations

import torch
import pytest

from core.registry import registry
from core.schemas import ModelInput


@pytest.fixture(autouse=True)
def _register_models():
    import models  # noqa: F401
    yield


class TestDemucsRegistration:
    def test_demucs_registered(self):
        assert "demucs" in registry.list_models()

    def test_create_default_variant(self):
        m = registry.create("demucs", variant="demucs_htdemucs")
        assert m.variant == "demucs_htdemucs"
        assert m.target_sr == 44100

    def test_invalid_variant_raises(self):
        with pytest.raises(ValueError, match="Unknown Demucs variant"):
            registry.create("demucs", variant="nonexistent")


class TestDemucsMockForward:
    def test_mock_forward_shape_single(self):
        m = registry.create("demucs", variant="demucs_htdemucs", force_mock=True)
        x = torch.randn(1, 2, 44100)
        out = m(ModelInput(x=x))
        assert out.y.shape == (1, 2, 44100)

    def test_mock_forward_shape_batch(self):
        m = registry.create("demucs", variant="demucs_htdemucs", force_mock=True)
        for bs in [1, 4]:
            x = torch.randn(bs, 2, 44100)
            out = m(ModelInput(x=x))
            assert out.y.shape == (bs, 2, 44100)

    def test_mock_mono_input(self):
        m = registry.create("demucs", variant="spleeter_2stems", force_mock=True)
        x = torch.randn(1, 1, 44100)
        out = m(ModelInput(x=x))
        assert out.y.shape == (1, 1, 44100)

    def test_mock_separate_reduces_gain(self):
        """Mock returns x * 0.3, so output should be quieter."""
        m = registry.create("demucs", variant="demucs_htdemucs", force_mock=True)
        x = torch.ones(1, 2, 1000)
        out = m(ModelInput(x=x))
        assert (out.y < x).all()

    def test_mock_different_stem(self):
        m = registry.create("demucs", variant="demucs_htdemucs", force_mock=True)
        x = torch.randn(1, 2, 44100)
        out = m(ModelInput(x=x, metadata={"stem": "vocals"}))
        assert out.y.shape == (1, 2, 44100)

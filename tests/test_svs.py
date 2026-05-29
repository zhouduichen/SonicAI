"""Tests for SVSModel — mock synthesis, lyrics metadata."""

from __future__ import annotations

import torch
import pytest

from core.registry import registry
from core.schemas import ModelInput


@pytest.fixture(autouse=True)
def _register_models():
    import models  # noqa: F401
    yield


class TestSVSRegistration:
    def test_svs_registered(self):
        assert "svs" in registry.list_models()

    def test_create_default(self):
        m = registry.create("svs", force_mock=True)
        assert m is not None


class TestSVSMockForward:
    @pytest.fixture
    def model(self):
        return registry.create("svs", force_mock=True)

    def test_mock_forward_shape(self, model):
        x = torch.randn(1, 1, 1)
        out = model(ModelInput(x=x, metadata={"lyrics": "la la la"}))
        assert out.y.ndim == 3  # (B, 1, T)
        assert out.y.shape[0] == 1
        assert out.y.shape[1] == 1
        assert out.y.shape[2] > 0

    def test_mock_single_line(self, model):
        x = torch.randn(1, 1, 1)
        out = model(ModelInput(x=x, metadata={"lyrics": "hello world"}))
        assert out.y.shape[2] > 0

    def test_mock_multiline(self, model):
        x = torch.randn(1, 1, 1)
        lyrics = "line one\nline two\nline three"
        out = model(ModelInput(x=x, metadata={"lyrics": lyrics}))
        assert out.y.shape[2] > 0

    def test_mock_empty_lyrics(self, model):
        x = torch.randn(1, 1, 1)
        out = model(ModelInput(x=x, metadata={"lyrics": ""}))
        assert out.y.shape[2] > 0  # should fall back to default

    def test_mock_audio_is_finite(self, model):
        x = torch.randn(1, 1, 1)
        out = model(ModelInput(x=x, metadata={"lyrics": "test"}))
        assert torch.isfinite(out.y).all()

    def test_mock_batch(self, model):
        x = torch.randn(2, 1, 1)
        out = model(ModelInput(x=x, metadata={"lyrics": "la"}))
        assert out.y.shape[0] == 2

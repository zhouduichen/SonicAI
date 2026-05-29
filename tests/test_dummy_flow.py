"""End-to-end test of the full training + inference pipeline using DummyModel."""

from __future__ import annotations

import torch
import pytest
from torch.utils.data import DataLoader, TensorDataset

from core.registry import registry
from core.schemas import ModelInput, TensorSpec


@pytest.fixture(autouse=True)
def _register_models():
    import models  # noqa: F401
    yield


class TestRegistry:
    def test_dummy_registered(self):
        assert "dummy" in registry.list_models()

    def test_create_dummy(self):
        model = registry.create("dummy", channels=2, hidden_dim=8)
        assert model is not None
        assert model.model_name == "DummyModel"

    def test_unknown_model_raises(self):
        with pytest.raises(KeyError, match="unknown_model"):
            registry.create("unknown_model")

    def test_register_duplicate_raises(self):
        from models.base import BaseModel
        with pytest.raises(ValueError, match="already registered"):
            registry.register("dummy", BaseModel)


class TestDummyModel:
    @pytest.fixture
    def model(self):
        return registry.create("dummy", channels=4, hidden_dim=16)

    def test_input_output_shapes(self, model):
        x = torch.randn(2, 4, 128)  # (B, C, T)
        model_input = ModelInput(x=x)
        output = model(model_input)
        assert output.y.shape == (2, 4, 128)  # (B, C, T)

    def test_batch_invariant(self, model):
        for batch_size in [1, 4, 16]:
            x = torch.randn(batch_size, 4, 64)
            output = model(ModelInput(x=x))
            assert output.y.shape == (batch_size, 4, 64)

    def test_different_channels(self):
        model = registry.create("dummy", channels=8, hidden_dim=32)
        x = torch.randn(1, 8, 100)
        output = model(ModelInput(x=x))
        assert output.y.shape == (1, 8, 100)

    def test_train_step(self, model):
        criterion = torch.nn.MSELoss()
        optimizer = torch.optim.SGD(model.parameters(), lr=0.01)

        x = torch.randn(4, 4, 64)
        target = torch.randn(4, 4, 64)

        model.train()
        output = model(ModelInput(x=x))
        loss = criterion(output.y, target)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        assert loss.item() > 0
        assert output.y.grad_fn is not None  # gradient graph exists

    def test_overfit_single_batch(self, model):
        """Model should overfit a single batch with enough steps."""
        x = torch.randn(4, 4, 64)
        target = x.clone()

        criterion = torch.nn.MSELoss()
        optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

        initial_loss = None
        for _ in range(200):
            model.train()
            output = model(ModelInput(x=x))
            loss = criterion(output.y, target)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            if initial_loss is None:
                initial_loss = loss.item()

        final_loss = loss.item()
        assert final_loss < initial_loss, f"Loss did not decrease: {initial_loss:.6f} -> {final_loss:.6f}"
        assert final_loss < 0.1, f"Final loss too high: {final_loss:.6f}"


class TestTensorSpec:
    def test_valid_bct(self):
        spec = TensorSpec(layout="BCT", channels=4)
        x = torch.randn(2, 4, 128)
        spec.validate_shape(x)  # should not raise

    def test_invalid_ndim(self):
        spec = TensorSpec(layout="BCT")
        with pytest.raises(ValueError, match="Expected 3D"):
            spec.validate_shape(torch.randn(2, 4))

    def test_invalid_channels(self):
        spec = TensorSpec(layout="BCT", channels=4)
        with pytest.raises(ValueError, match="Expected channels=4"):
            spec.validate_shape(torch.randn(2, 8, 128))

    def test_bft_layout(self):
        spec = TensorSpec(layout="BFT", freqs=256)
        x = torch.randn(2, 256, 128)
        spec.validate_shape(x)  # should not raise


class TestEndToEnd:
    def test_train_infer_flow(self):
        model = registry.create("dummy", channels=2, hidden_dim=8)

        # Training
        x = torch.randn(16, 2, 32)
        y = x.clone()
        dataset = TensorDataset(x, y)
        loader = DataLoader(dataset, batch_size=4, shuffle=True)

        from engine.trainer import train
        # Wrap tuples as dicts (trainer expects {"x": x, "y": y})
        dict_batches = [{"x": x, "y": y} for x, y in loader]
        history = train(model, dict_batches, num_epochs=3)
        assert "loss" in history
        assert len(history["loss"]) == 3

        # Inference
        from engine.inferencer import predict
        output = predict(model, x[:1])
        assert output.y.shape == (1, 2, 32)

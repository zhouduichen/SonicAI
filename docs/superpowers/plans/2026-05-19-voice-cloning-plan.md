# Voice Cloning Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add RVC voice cloning to SonicAI — users upload songs, train voice models, and generate singing with cloned voices.

**Architecture:** New `VoiceModel` and `VocalGeneration` SQLAlchemy models, `/api/v1/voice/*` REST endpoints, Celery async tasks for the RVC training pipeline, and a `VoiceModelLibrary.tsx` frontend component (mirroring existing `StyleLibrary.tsx`) accessible as a new sidebar nav item.

**Tech Stack:** FastAPI + SQLAlchemy + Celery + Redis + RVC (git submodule)

---

## File Map

```
backend/
├── app/
│   ├── main.py                        # Modify: register voice router
│   ├── models/
│   │   ├── __init__.py                # Modify: export new models
│   │   ├── voice_model.py             # Create: VoiceModel ORM
│   │   └── vocal_generation.py        # Create: VocalGeneration ORM
│   ├── schemas/
│   │   └── voice.py                   # Create: voice Pydantic schemas
│   ├── services/
│   │   └── voice_service.py           # Create: voice CRUD operations
│   ├── tasks/
│   │   ├── celerty_app.py             # Modify: add voice_pipeline to autodiscover
│   │   └── voice_pipeline.py          # Create: RVC training + inference tasks
│   └── api/v1/
│       └── voice.py                   # Create: /voice/* endpoints

frontend/
├── src/
│   ├── types/
│   │   └── index.ts                   # Modify: add VoiceModel + VocalGeneration types
│   ├── components/
│   │   └── VoiceModelLibrary.tsx      # Create: mirror of StyleLibrary.tsx
│   └── app/create/
│       └── page.tsx                   # Modify: add "voice" tab
│   └── components/
│       └── Sidebar.tsx                # Modify: add VOICE nav item
```

---

### Task 1: Backend — VoiceModel + VocalGeneration ORM models

**Files:**
- Create: `backend/app/models/voice_model.py`
- Create: `backend/app/models/vocal_generation.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Create VoiceModel ORM**

```python
# backend/app/models/voice_model.py
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, func
from app.core.database import Base


class VoiceModel(Base):
    __tablename__ = "voice_models"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    source_audio_id = Column(Integer, ForeignKey("audio_assets.id"), nullable=True)
    checkpoint_path = Column(String(512), nullable=True)
    config_path = Column(String(512), nullable=True)
    status = Column(String(20), default="pending")  # pending, preprocessing, training, ready, failed
    epoch = Column(Integer, default=0)
    quality_tier = Column(String(20), default="preview")  # preview, standard, premium
    duration_seconds = Column(Float, default=0.0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
```

- [ ] **Step 2: Create VocalGeneration ORM**

```python
# backend/app/models/vocal_generation.py
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, func
from app.core.database import Base


class VocalGeneration(Base):
    __tablename__ = "vocal_generations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    voice_model_id = Column(Integer, ForeignKey("voice_models.id"), nullable=False)
    reference_audio_id = Column(Integer, ForeignKey("audio_assets.id"), nullable=True)
    output_path = Column(String(512), nullable=True)
    status = Column(String(20), default="pending")  # pending, processing, completed, failed
    duration_seconds = Column(Float, default=0.0)
    created_at = Column(DateTime, server_default=func.now())
```

- [ ] **Step 3: Update models __init__.py**

```python
# backend/app/models/__init__.py — replace entire file
from app.models.user import User
from app.models.audio_asset import AudioAsset
from app.models.style_vector import StyleVector
from app.models.generated_music import GeneratedMusic
from app.models.voice_model import VoiceModel
from app.models.vocal_generation import VocalGeneration
from app.core.database import Base

__all__ = ["User", "AudioAsset", "StyleVector", "GeneratedMusic", "VoiceModel", "VocalGeneration", "Base"]
```

- [ ] **Step 4: Commit**

```bash
cd backend && git add app/models/voice_model.py app/models/vocal_generation.py app/models/__init__.py
git commit -m "feat: add VoiceModel and VocalGeneration ORM models"
```

---

### Task 2: Backend — Voice Pydantic schemas

**Files:**
- Create: `backend/app/schemas/voice.py`

- [ ] **Step 1: Create voice schemas**

```python
# backend/app/schemas/voice.py
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class TrainVoiceRequest(BaseModel):
    audio_asset_id: int
    name: str
    quality_target: str = "premium"  # preview | standard | premium


class TrainVoiceResponse(BaseModel):
    model_id: int
    status: str  # "preprocessing"
    message: str = "Voice training started"


class VoiceModelStatus(BaseModel):
    id: int
    name: str
    status: str  # pending, preprocessing, training, ready, failed
    current_epoch: int
    total_epochs: int = 200
    current_tier: str  # preview, standard, premium
    available_tiers: list[str]
    estimated_remaining_seconds: Optional[int] = None

    class Config:
        from_attributes = True


class VoiceModelResponse(BaseModel):
    id: int
    name: str
    status: str
    quality_tier: str
    epoch: int
    duration_seconds: float
    created_at: datetime

    class Config:
        from_attributes = True


class VoiceModelListResponse(BaseModel):
    items: list[VoiceModelResponse]
    total: int


class SingRequest(BaseModel):
    voice_model_id: int
    reference_audio_id: int


class SingResponse(BaseModel):
    generation_id: int
    status: str
    message: str = "Vocal generation started"


class VocalGenerationResponse(BaseModel):
    id: int
    voice_model_id: int
    output_path: str
    status: str
    duration_seconds: float
    created_at: datetime

    class Config:
        from_attributes = True


class VocalGenerationListResponse(BaseModel):
    items: list[VocalGenerationResponse]
    total: int
```

- [ ] **Step 2: Commit**

```bash
cd backend && git add app/schemas/voice.py && git commit -m "feat: add voice Pydantic schemas"
```

---

### Task 3: Backend — Voice service (CRUD operations)

**Files:**
- Create: `backend/app/services/voice_service.py`

- [ ] **Step 1: Create voice service**

```python
# backend/app/services/voice_service.py
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.voice_model import VoiceModel
from app.models.vocal_generation import VocalGeneration


def create_voice_model(db: Session, user_id: int, name: str, source_audio_id: int, quality_target: str = "premium") -> VoiceModel:
    total_epochs = {"preview": 20, "standard": 100, "premium": 200}.get(quality_target, 200)
    model = VoiceModel(
        user_id=user_id,
        name=name,
        source_audio_id=source_audio_id,
        status="pending",
        quality_tier=quality_target,
    )
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


def get_voice_model(db: Session, model_id: int, user_id: int) -> VoiceModel | None:
    return db.query(VoiceModel).filter(
        VoiceModel.id == model_id, VoiceModel.user_id == user_id
    ).first()


def list_user_voice_models(db: Session, user_id: int) -> list[VoiceModel]:
    return (
        db.query(VoiceModel)
        .filter(VoiceModel.user_id == user_id)
        .order_by(desc(VoiceModel.updated_at))
        .all()
    )


def update_voice_model_status(db: Session, model_id: int, user_id: int, **kwargs) -> VoiceModel | None:
    model = get_voice_model(db, model_id, user_id)
    if not model:
        return None
    for key, value in kwargs.items():
        if hasattr(model, key):
            setattr(model, key, value)
    db.commit()
    db.refresh(model)
    return model


def delete_voice_model(db: Session, model_id: int, user_id: int) -> bool:
    import os, shutil
    model = get_voice_model(db, model_id, user_id)
    if not model:
        return False
    # Clean up checkpoint files
    if model.checkpoint_path and os.path.exists(model.checkpoint_path):
        checkpoint_dir = os.path.dirname(model.checkpoint_path)
        if os.path.exists(checkpoint_dir):
            shutil.rmtree(checkpoint_dir, ignore_errors=True)
    db.delete(model)
    db.commit()
    return True


def create_vocal_generation(db: Session, user_id: int, voice_model_id: int, reference_audio_id: int) -> VocalGeneration:
    gen = VocalGeneration(
        user_id=user_id,
        voice_model_id=voice_model_id,
        reference_audio_id=reference_audio_id,
        status="pending",
    )
    db.add(gen)
    db.commit()
    db.refresh(gen)
    return gen


def list_user_vocal_generations(db: Session, user_id: int) -> list[VocalGeneration]:
    return (
        db.query(VocalGeneration)
        .filter(VocalGeneration.user_id == user_id)
        .order_by(desc(VocalGeneration.created_at))
        .all()
    )
```

- [ ] **Step 2: Commit**

```bash
cd backend && git add app/services/voice_service.py && git commit -m "feat: add voice service CRUD operations"
```

---

### Task 4: Backend — Celery voice training pipeline

**Files:**
- Create: `backend/app/tasks/voice_pipeline.py`
- Modify: `backend/app/tasks/celerty_app.py`

- [ ] **Step 1: Add autodiscover for voice_pipeline**

In `backend/app/tasks/celerty_app.py`, line 27, change:

```python
# Old:
celery_app.autodiscover_tasks(["app.tasks.audio_pipeline"])

# New:
celery_app.autodiscover_tasks(["app.tasks.audio_pipeline", "app.tasks.voice_pipeline"])
```

- [ ] **Step 2: Create voice training pipeline**

```python
# backend/app/tasks/voice_pipeline.py
"""Celery tasks for RVC voice training and inference."""

import os
import json
import logging
from app.tasks.celery_app import celery_app
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _report_voice_progress(model_id: int, stage: str, progress: int, message: str):
    """Update voice model status in DB for frontend polling."""
    from app.core.database import SessionLocal
    from app.models.voice_model import VoiceModel

    db = SessionLocal()
    try:
        model = db.query(VoiceModel).filter(VoiceModel.id == model_id).first()
        if model:
            model.status = stage
            db.commit()
    finally:
        db.close()


# === Celery Task: Voice Training Pipeline ===

@celery_app.task(bind=True, name="train_voice_model")
def train_voice_model(self, model_id: int, audio_path: str, quality_target: str = "premium"):
    """Full voice training pipeline: separate vocals -> preprocess -> train RVC."""
    from app.core.database import SessionLocal
    from app.models.voice_model import VoiceModel
    from app.models.audio_asset import AudioAsset
    from app.tasks.audio_pipeline import _separate_vocals

    epoch_map = {"preview": 20, "standard": 100, "premium": 200}
    total_epochs = epoch_map.get(quality_target, 200)
    quality_tiers = []
    if total_epochs >= 20:
        quality_tiers.append(("preview", 20))
    if total_epochs >= 100:
        quality_tiers.append(("standard", 100))
    if total_epochs >= 200:
        quality_tiers.append(("premium", 200))

    task_id = self.request.id
    logger.info(f"train_voice_model: model_id={model_id} quality_target={quality_target} total_epochs={total_epochs}")

    output_dir = os.path.join(settings.GENERATED_DIR, "voice_models", str(model_id))
    os.makedirs(output_dir, exist_ok=True)

    try:
        db = SessionLocal()
        try:
            model = db.query(VoiceModel).filter(VoiceModel.id == model_id).first()
            if not model:
                return {"stage": "failed", "reason": "voice model not found"}
            model.status = "preprocessing"
            db.commit()

            # Step 1: Vocal separation
            vocal_path = _separate_vocals(audio_path, task_id=task_id)

            # Step 2: RVC preprocessing (audio slicing, normalization)
            model.status = "preprocessing"
            db.commit()
            preprocessed_dir = os.path.join(output_dir, "dataset")
            _rvc_preprocess(vocal_path, preprocessed_dir)

            # Step 3: HuBERT feature extraction
            hubert_dir = os.path.join(output_dir, "hubert")
            _rvc_extract_features(preprocessed_dir, hubert_dir)

            # Step 4: Progressive training
            model.status = "training"
            model.epoch = 0
            db.commit()

            for tier_name, tier_epochs in quality_tiers:
                checkpoint_dir = os.path.join(output_dir, f"checkpoint_{tier_name}")
                _rvc_train(
                    hubert_dir=hubert_dir,
                    output_dir=checkpoint_dir,
                    total_epochs=tier_epochs,
                    model_id=model_id,
                    start_epoch=model.epoch,
                    on_progress=lambda ep: _report_training_progress(model_id, ep, total_epochs),
                )
                model.epoch = tier_epochs
                model.quality_tier = tier_name
                model.checkpoint_path = os.path.join(checkpoint_dir, "model.pth")
                model.config_path = os.path.join(checkpoint_dir, "config.json")
                db.commit()

            model.status = "ready"
            db.commit()

            return {
                "stage": "completed",
                "model_id": model_id,
                "quality_tier": quality_target,
                "epoch": total_epochs,
            }
        finally:
            db.close()
    except Exception as e:
        db = SessionLocal()
        try:
            model = db.query(VoiceModel).filter(VoiceModel.id == model_id).first()
            if model:
                model.status = "failed"
                db.commit()
        finally:
            db.close()
        logger.error(f"Voice training failed: {e}")
        raise


# === Celery Task: RVC Inference ===

@celery_app.task(bind=True, name="infer_rvc_vocals")
def infer_rvc_vocals(self, generation_id: int, voice_model_id: int, reference_audio_path: str):
    """Convert reference vocals to target voice using trained RVC model."""
    from app.core.database import SessionLocal
    from app.models.voice_model import VoiceModel
    from app.models.vocal_generation import VocalGeneration

    task_id = self.request.id
    logger.info(f"infer_rvc_vocals: generation_id={generation_id} model_id={voice_model_id}")

    output_dir = os.path.join(settings.GENERATED_DIR, "vocals")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"vocal_{generation_id}.wav")

    try:
        db = SessionLocal()
        try:
            model = db.query(VoiceModel).filter(VoiceModel.id == voice_model_id).first()
            if not model or model.status != "ready":
                raise ValueError("Voice model not ready")

            gen = db.query(VocalGeneration).filter(VocalGeneration.id == generation_id).first()
            gen.status = "processing"
            db.commit()

            _rvc_infer(
                model_path=model.checkpoint_path,
                config_path=model.config_path,
                reference_audio=reference_audio_path,
                output_path=output_path,
            )

            gen.status = "completed"
            gen.output_path = output_path
            db.commit()

            return {"stage": "completed", "generation_id": generation_id, "output_path": output_path}
        finally:
            db.close()
    except Exception as e:
        db = SessionLocal()
        try:
            gen = db.query(VocalGeneration).filter(VocalGeneration.id == generation_id).first()
            if gen:
                gen.status = "failed"
                db.commit()
        finally:
            db.close()
        logger.error(f"Voice inference failed: {e}")
        raise


# === Placeholder RVC functions (replace with real RVC imports after submodule setup) ===

def _rvc_preprocess(audio_path: str, output_dir: str):
    """Preprocess audio: slicing, normalization, silence trimming."""
    os.makedirs(output_dir, exist_ok=True)
    import shutil
    dst = os.path.join(output_dir, os.path.basename(audio_path))
    shutil.copy(audio_path, dst)
    logger.info(f"RVC preprocess: {audio_path} -> {output_dir}")


def _rvc_extract_features(dataset_dir: str, hubert_dir: str):
    """Extract HuBERT features for RVC training."""
    os.makedirs(hubert_dir, exist_ok=True)
    logger.info(f"RVC feature extraction: {dataset_dir} -> {hubert_dir}")


def _rvc_train(hubert_dir: str, output_dir: str, total_epochs: int, model_id: int, start_epoch: int, on_progress):
    """Train RVC VITS model. Calls on_progress(epoch) after each epoch."""
    os.makedirs(output_dir, exist_ok=True)
    import time
    for ep in range(start_epoch + 1, total_epochs + 1):
        time.sleep(0.01)  # placeholder — real RVC training step
        on_progress(ep)
    logger.info(f"RVC training complete: {total_epochs} epochs -> {output_dir}")


def _rvc_infer(model_path: str, config_path: str, reference_audio: str, output_path: str):
    """Run RVC inference: convert reference audio to target voice."""
    import shutil
    shutil.copy(reference_audio, output_path)
    logger.info(f"RVC inference: {reference_audio} -> {output_path}")


def _report_training_progress(model_id: int, current_epoch: int, total_epochs: int):
    """Update DB with training progress."""
    from app.core.database import SessionLocal
    from app.models.voice_model import VoiceModel

    db = SessionLocal()
    try:
        model = db.query(VoiceModel).filter(VoiceModel.id == model_id).first()
        if model:
            model.epoch = current_epoch
            db.commit()
    finally:
        db.close()
```

- [ ] **Step 3: Commit**

```bash
cd backend && git add app/tasks/voice_pipeline.py app/tasks/celerty_app.py
git commit -m "feat: add RVC voice training and inference Celery tasks"
```

---

### Task 5: Backend — Voice API routes

**Files:**
- Create: `backend/app/api/v1/voice.py`

- [ ] **Step 1: Create voice API router**

```python
# backend/app/api/v1/voice.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models.voice_model import VoiceModel
from app.models.audio_asset import AudioAsset
from app.models.vocal_generation import VocalGeneration
from app.schemas.voice import (
    TrainVoiceRequest, TrainVoiceResponse,
    VoiceModelStatus, VoiceModelResponse, VoiceModelListResponse,
    SingRequest, SingResponse,
    VocalGenerationResponse, VocalGenerationListResponse,
)
from app.services import voice_service
from app.tasks.voice_pipeline import train_voice_model, infer_rvc_vocals

router = APIRouter(prefix="/voice", tags=["voice"])

EPOCH_TARGETS = {"preview": 20, "standard": 100, "premium": 200}
TIER_MILESTONES = [("preview", 20), ("standard", 100), ("premium", 200)]


@router.post("/train", response_model=TrainVoiceResponse)
def train(request: TrainVoiceRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    asset = db.query(AudioAsset).filter(
        AudioAsset.id == request.audio_asset_id, AudioAsset.user_id == user.id
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="音频文件不存在")
    if asset.status != "completed":
        raise HTTPException(status_code=400, detail="音频尚未处理完成")

    total_epochs = EPOCH_TARGETS.get(request.quality_target, 200)

    model = voice_service.create_voice_model(
        db, user.id, request.name, request.audio_asset_id, request.quality_target
    )

    train_voice_model.delay(
        model_id=model.id,
        audio_path=asset.file_path,
        quality_target=request.quality_target,
    )

    return TrainVoiceResponse(model_id=model.id, status="preprocessing")


@router.get("/status/{model_id}", response_model=VoiceModelStatus)
def get_status(model_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    model = voice_service.get_voice_model(db, model_id, user.id)
    if not model:
        raise HTTPException(status_code=404, detail="声音模型不存在")

    total_epochs = EPOCH_TARGETS.get(model.quality_tier, 200)
    available_tiers = []
    for tier_name, tier_epochs in TIER_MILESTONES:
        if model.epoch >= tier_epochs:
            available_tiers.append(tier_name)

    remaining = None
    if model.status == "training" and model.epoch > 0:
        elapsed_per_epoch = 15  # approximate seconds per epoch
        remaining = (total_epochs - model.epoch) * elapsed_per_epoch

    return VoiceModelStatus(
        id=model.id,
        name=model.name,
        status=model.status,
        current_epoch=model.epoch,
        total_epochs=total_epochs,
        current_tier=model.quality_tier,
        available_tiers=available_tiers,
        estimated_remaining_seconds=remaining,
    )


@router.get("/models", response_model=VoiceModelListResponse)
def list_models(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = voice_service.list_user_voice_models(db, user.id)
    return VoiceModelListResponse(
        items=[VoiceModelResponse.model_validate(m) for m in items],
        total=len(items),
    )


@router.delete("/models/{model_id}")
def delete_model(model_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    success = voice_service.delete_voice_model(db, model_id, user.id)
    if not success:
        raise HTTPException(status_code=404, detail="声音模型不存在")
    return {"ok": True}


@router.post("/sing", response_model=SingResponse)
def sing(request: SingRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    model = voice_service.get_voice_model(db, request.voice_model_id, user.id)
    if not model:
        raise HTTPException(status_code=404, detail="声音模型不存在")
    if model.status != "ready":
        raise HTTPException(status_code=400, detail="声音模型尚未训练完成")

    ref_audio = db.query(AudioAsset).filter(
        AudioAsset.id == request.reference_audio_id, AudioAsset.user_id == user.id
    ).first()
    if not ref_audio:
        raise HTTPException(status_code=404, detail="参考音频不存在")

    gen = voice_service.create_vocal_generation(db, user.id, request.voice_model_id, request.reference_audio_id)
    infer_rvc_vocals.delay(
        generation_id=gen.id,
        voice_model_id=model.id,
        reference_audio_path=ref_audio.file_path,
    )

    return SingResponse(generation_id=gen.id, status="pending")


@router.get("/generations", response_model=VocalGenerationListResponse)
def list_generations(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = voice_service.list_user_vocal_generations(db, user.id)
    return VocalGenerationListResponse(
        items=[VocalGenerationResponse.model_validate(g) for g in items],
        total=len(items),
    )
```

- [ ] **Step 2: Register router in main.py**

In `backend/app/main.py`, after the existing router registrations (line 38), add:

```python
from app.api.v1 import voice
app.include_router(voice.router, prefix="/api/v1")
```

- [ ] **Step 3: Ensure voice_service is importable from app.services**

Verify `backend/app/services/__init__.py` exists. If empty, the import `from app.services import voice_service` will still work because Python will find the module. No changes needed — the existing pattern uses direct imports like `from app.services.auth_service import ...` (not through `__init__.py`).

- [ ] **Step 4: Commit**

```bash
cd backend && git add app/api/v1/voice.py app/main.py
git commit -m "feat: add /voice/* API endpoints for voice training and generation"
```

---

### Task 6: Frontend — TypeScript types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add VoiceModel and VocalGeneration types**

Append to `frontend/src/types/index.ts`:

```typescript
export interface VoiceModel {
  id: string;
  name: string;
  sourceAudioId: string;
  status: "pending" | "preprocessing" | "training" | "ready" | "failed";
  epoch: number;
  qualityTier: "preview" | "standard" | "premium";
  durationSeconds: number;
  createdAt: string;
}

export interface VocalGeneration {
  id: string;
  voiceModelId: string;
  outputPath: string;
  status: "pending" | "processing" | "completed" | "failed";
  durationSeconds: number;
  createdAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/types/index.ts && git commit -m "feat: add VoiceModel and VocalGeneration TypeScript types"
```

---

### Task 7: Frontend — VoiceModelLibrary component

**Files:**
- Create: `frontend/src/components/VoiceModelLibrary.tsx`

- [ ] **Step 1: Create VoiceModelLibrary.tsx**

This is a mirror of `StyleLibrary.tsx` with 10 specific replacements documented in the design spec. Copy `StyleLibrary.tsx` to `VoiceModelLibrary.tsx` and apply these changes:

```typescript
// frontend/src/components/VoiceModelLibrary.tsx
// Mirror of StyleLibrary.tsx — same structure, different data type and labels

"use client";

import { Trash, Microphone } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import type { VoiceModel } from "@/types";

interface VoiceModelLibraryProps {
  models: VoiceModel[];
  onSelect: (model: VoiceModel) => void;
  onDelete: (id: string) => void;
  selectedId?: string;
}

const QUALITY_LABELS: Record<string, string> = {
  preview: "Preview",
  standard: "Standard",
  premium: "Premium",
};

export default function VoiceModelLibrary({ models, onSelect, onDelete, selectedId }: VoiceModelLibraryProps) {
  return (
    <div className="card-outer">
      <div className="card-inner p-6 space-y-5 relative overflow-hidden">
        {/* Top deco */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, var(--accent), transparent)" }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ background: "var(--accent)", opacity: 0.4 }} />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="eyebrow">声音模型</span>
            <h3 className="text-lg italic font-medium"
              style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
              声音模型库
            </h3>
          </div>
          <span className="text-[10px] font-mono tracking-[0.15em]"
            style={{ color: "var(--text-tertiary)" }}>
            {models.length} 个声音
          </span>
        </div>

        {models.length === 0 ? (
          <div className="py-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rotate-45 flex items-center justify-center"
              style={{ border: "1.5px dashed var(--border-color)" }}>
              <Microphone size={18} weight="regular" className="-rotate-45" style={{ color: "var(--text-tertiary)" }} />
            </div>
            <p className="text-sm italic" style={{ color: "var(--text-secondary)", fontFamily: "'Playfair Display', serif" }}>
              暂无声音模型
            </p>
            <p className="text-xs mt-1 font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              上传歌曲训练你的专属声音
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            <AnimatePresence>
              {models.map((model) => {
                const active = selectedId === model.id;
                const subLabel = model.status === "training"
                  ? `TRAINING · ${model.epoch}/200 epoch`
                  : `${QUALITY_LABELS[model.qualityTier] || model.qualityTier} · ${model.epoch} epochs · ${Math.round(model.durationSeconds)}s`;
                return (
                  <motion.div
                    key={model.id}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.25 }}
                    onClick={() => onSelect(model)}
                    className="group flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-300"
                    style={{
                      background: active ? "var(--accent-soft)" : "transparent",
                      borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                      borderRadius: 8,
                    }}
                  >
                    <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
                      <div className="absolute inset-0 rounded-full"
                        style={{
                          background: active ? "var(--accent-soft)" : "var(--bg-tertiary)",
                          border: active ? "1.5px solid var(--accent)" : "1px solid var(--border-color)",
                        }} />
                      <Microphone size={14} weight={active ? "fill" : "regular"}
                        style={{ color: active ? "var(--accent)" : "var(--text-tertiary)" }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate"
                        style={{ color: active ? "var(--accent)" : "var(--text-primary)" }}>
                        {model.name}
                      </p>
                      <p className="text-[10px] font-mono tracking-wider"
                        style={{ color: "var(--text-tertiary)" }}>
                        {subLabel}
                      </p>
                    </div>

                    {active && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: "var(--accent)", color: "#0d0d0d" }}>
                        {QUALITY_LABELS[model.qualityTier] || model.qualityTier}
                      </span>
                    )}

                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(model.id); }}
                      className="p-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-full"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      <Trash size={14} weight="regular" />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Bottom deco */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to left, var(--accent), transparent)" }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ background: "var(--accent)", opacity: 0.4 }} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/components/VoiceModelLibrary.tsx
git commit -m "feat: add VoiceModelLibrary component (mirror of StyleLibrary)"
```

---

### Task 8: Frontend — Sidebar nav item + create page tab

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/app/create/page.tsx`

- [ ] **Step 1: Add VOICE nav item to Sidebar.tsx**

In `Sidebar.tsx`, line 6, add `Microphone` to the Phosphor import:
```typescript
import { House, MusicNotes, WaveSine, Books, Playlist, Disc, Microphone } from "@phosphor-icons/react";
```

In `Sidebar.tsx`, line 15-19, add the voice item to `navItems`:
```typescript
const navItems = [
  { id: "studio", label: "STUDIO", sub: "创作工作室", icon: WaveSine },
  { id: "library", label: "LIBRARY", sub: "风格库", icon: Books },
  { id: "voice", label: "VOICE", sub: "声音模型库", icon: Microphone },
  { id: "history", label: "ARCHIVE", sub: "生成记录", icon: Playlist },
];
```

- [ ] **Step 2: Add voice tab to create/page.tsx**

In `create/page.tsx`, add the import after existing imports (around line 12):
```typescript
import VoiceModelLibrary from "@/components/VoiceModelLibrary";
```

Add voice model state in the component (around line 75, after `selectedStyle`):
```typescript
const [voiceModels, setVoiceModels] = useState<import("@/types").VoiceModel[]>([]);
const [selectedVoiceId, setSelectedVoiceId] = useState<string | undefined>(undefined);
```

Add the voice tab rendering after `activeTab === "library"` block and before `activeTab === "history"` block (around line 281):
```typescript
{activeTab === "voice" && (
  <motion.div key="voice" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }} className="max-w-2xl">
    <VoiceModelLibrary
      models={voiceModels}
      selectedId={selectedVoiceId}
      onSelect={(model) => setSelectedVoiceId(model.id)}
      onDelete={(id) => setVoiceModels((prev) => prev.filter((m) => m.id !== id))}
    />
  </motion.div>
)}
```

Update the eyebrow/breadcrumb header text (around lines 208-221) to also handle the "voice" tab:
```typescript
// In the eyebrow span (line 209):
{activeTab === "studio" ? "创作工作室" : activeTab === "library" ? "风格库" : activeTab === "voice" ? "声音模型库" : "生成记录"}
// In the h2 (line 213):
{activeTab === "studio" ? "AI 音乐创作" : activeTab === "library" ? "风格标签管理" : activeTab === "voice" ? "声音模型管理" : "生成历史记录"}
// In the description (line 219):
{activeTab === "studio" ? "上传音频 → 选择风格标签 → 输入描述 → 生成专属音乐" : activeTab === "library" ? "查看、选择或删除已提取的音乐风格特征向量" : activeTab === "voice" ? "上传歌曲训练专属声音模型，选择模型生成人声" : "播放和回顾所有已生成的 AI 音乐作品"}
```

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/Sidebar.tsx src/app/create/page.tsx
git commit -m "feat: add VOICE sidebar nav item and voice tab to create page"
```

---

### Task 9: Integration — Wire up frontend to backend API

**Files:**
- Modify: `frontend/src/app/create/page.tsx`

- [ ] **Step 1: Add API calls for voice endpoints**

Add these API functions inside `create/page.tsx`, after the existing API functions (around line 70):

```typescript
async function apiTrainVoice(audioAssetId: string, name: string, qualityTarget: string): Promise<{ model_id: number }> {
  const res = await fetch(`${API_BASE}/voice/train`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ audio_asset_id: parseInt(audioAssetId), name, quality_target: qualityTarget }),
  });
  if (!res.ok) throw new Error("Voice training failed");
  return res.json();
}

async function apiGetVoiceModels(): Promise<VoiceModel[]> {
  const res = await fetch(`${API_BASE}/voice/models`, { headers: await authHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items.map((item: any) => ({
    id: String(item.id),
    name: item.name,
    sourceAudioId: String(item.id),
    status: item.status,
    epoch: item.epoch,
    qualityTier: item.quality_tier,
    durationSeconds: item.duration_seconds,
    createdAt: item.created_at,
  }));
}

async function apiPollVoiceStatus(modelId: number): Promise<{ status: string; current_epoch: number }> {
  const res = await fetch(`${API_BASE}/voice/status/${modelId}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error("Status check failed");
  return res.json();
}
```

Update the `VoiceModel` import to not be inline:

At the top of the file (line 13), add `VoiceModel` to the type import:
```typescript
import type { AudioAsset, StyleTag, GeneratedMusic, TaskStatus, ModelCatalog, ModelSelection, VoiceModel } from "@/types";
```

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/app/create/page.tsx && git commit -m "feat: wire up voice API calls in create page"
```

---

### Task 10: RVC Git Submodule + Real Model Integration

**Files:**
- Modify: `backend/app/tasks/voice_pipeline.py` (replace placeholders)
- Create: `.gitmodules`

- [ ] **Step 1: Add RVC as git submodule**

```bash
cd backend
git submodule add https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI.git app/services/rvc
```

- [ ] **Step 2: Install RVC dependencies**

```bash
cd backend
pip install torch torchaudio fairseq pyworld praat-parselmouth
```

- [ ] **Step 3: Replace placeholder functions in voice_pipeline.py**

Replace the four placeholder functions `_rvc_preprocess`, `_rvc_extract_features`, `_rvc_train`, `_rvc_infer` with real RVC imports. The exact implementation depends on RVC's Python API at the time of integration. The key interface points are:

```python
# Real RVC integration (replace placeholders after submodule is available)

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "rvc"))

def _rvc_preprocess(audio_path: str, output_dir: str):
    """Preprocess audio via RVC's audio slicer and normalizer."""
    from rvc.preprocess import preprocess_audio
    preprocess_audio(audio_path, output_dir, sample_rate=40000)


def _rvc_extract_features(dataset_dir: str, hubert_dir: str):
    """Extract HuBERT features for RVC training."""
    from rvc.feature_extractor import ContentVecExtractor
    extractor = ContentVecExtractor()
    extractor.extract(dataset_dir, hubert_dir)


def _rvc_train(hubert_dir: str, output_dir: str, total_epochs: int, model_id: int, start_epoch: int, on_progress):
    """Train RVC VITS model."""
    from rvc.train import train_model
    train_model(
        hubert_dir=hubert_dir,
        output_dir=output_dir,
        total_epochs=total_epochs,
        start_epoch=start_epoch,
        batch_size=8,
        save_every=20,
        on_epoch_end=on_progress,
    )


def _rvc_infer(model_path: str, config_path: str, reference_audio: str, output_path: str):
    """Run RVC inference."""
    from rvc.infer import infer
    infer(
        model_path=model_path,
        config_path=config_path,
        input_audio=reference_audio,
        output_path=output_path,
        pitch_shift=0,
    )
```

- [ ] **Step 4: Commit**

```bash
cd backend && git add .gitmodules app/services/rvc app/tasks/voice_pipeline.py && git commit -m "feat: add RVC git submodule and wire up real training/inference"
```

---

### Task 11: Verify end-to-end

- [ ] **Step 1: Start all services**

```bash
# Terminal 1: Redis
docker compose up -d

# Terminal 2: Backend API
cd backend && uvicorn app.main:app --reload --port 8000

# Terminal 3: Celery worker
cd backend && celery -A app.tasks.celery_app worker -l info -P solo

# Terminal 4: Frontend
cd frontend && npm run dev
```

- [ ] **Step 2: Verify API endpoints**

```bash
# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# List voice models (should be empty)
curl http://localhost:8000/api/v1/voice/models \
  -H "Authorization: Bearer <token>"

# Upload audio for voice training
curl -X POST http://localhost:8000/api/v1/audio/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/song.mp3"
```

- [ ] **Step 3: Open frontend and verify**

1. Open `http://localhost:3000/create`
2. Click "VOICE · 声音模型库" in sidebar
3. Verify empty state shows "暂无声音模型" with microphone icon
4. Verify styling matches StyleLibrary (Double-Bezel, deco lines, Playfair italic title)

- [ ] **Step 4: Commit (if any fixes)**

```bash
git add -A && git commit -m "chore: final integration fixes"
```

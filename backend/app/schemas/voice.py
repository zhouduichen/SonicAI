from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


class TrainVoiceRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    audio_asset_ids: list[int]
    name: str
    quality_target: str = "premium"  # preview | standard | premium


class TrainVoiceResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    model_id: int
    status: str
    message: str = "Voice training started"


class VoiceModelStatus(BaseModel):
    id: int
    name: str
    status: str
    current_epoch: int
    total_epochs: int = 200
    current_tier: str
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

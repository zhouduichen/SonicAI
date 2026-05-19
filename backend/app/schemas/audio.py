from pydantic import BaseModel
from datetime import datetime


class UploadResponse(BaseModel):
    asset_id: int
    task_id: str
    message: str = "Audio uploaded, processing started"
    vocal_sep_model: str = "demucs_htdemucs"
    style_extract_model: str = "clap_laion"


class StyleVectorResponse(BaseModel):
    id: int
    style_name: str
    asset_id: int
    style_extract_model: str = "clap_laion"
    created_at: datetime

    class Config:
        from_attributes = True


class StatusResponse(BaseModel):
    task_id: str
    stage: str  # separating, extracting, generating, completed, failed
    progress: int  # 0-100
    message: str
    style_vector: StyleVectorResponse | None = None
    vocal_sep_model: str | None = None
    style_extract_model: str | None = None
    # Music generation result fields (populated when polling a music-gen task)
    music_id: int | None = None
    file_path: str | None = None
    title: str | None = None
    duration_seconds: int | None = None
    music_gen_model: str | None = None

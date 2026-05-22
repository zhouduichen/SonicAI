from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


class SongCreateRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    theme: str
    style_vector_id: Optional[int] = None
    voice_model_id: Optional[int] = None
    reference_audio_id: Optional[int] = None


class SongCreateResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    song_id: int
    status: str = "writing"


class SongStatusResponse(BaseModel):
    id: int
    theme: str
    status: str
    lyrics: str
    instrumental_path: str
    vocal_path: str
    mixed_path: str
    error_message: str = ""
    lyrics_provider: str = ""
    instrumental_provider: str = ""
    vocal_provider: str = ""
    has_vocals: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class SongListResponse(BaseModel):
    items: list[SongStatusResponse]
    total: int

from pydantic import BaseModel
from datetime import datetime


class GenerateRequest(BaseModel):
    style_vector_id: int
    text_prompt: str
    music_gen_model: str = "musicgen_small"


class GenerateResponse(BaseModel):
    task_id: str
    message: str = "Music generation started"
    music_gen_model: str = "musicgen_small"


class MusicResponse(BaseModel):
    id: int
    title: str
    prompt: str
    style_name: str
    file_path: str
    duration_seconds: int
    music_gen_model: str = "musicgen_small"
    created_at: datetime

    class Config:
        from_attributes = True


class MusicListResponse(BaseModel):
    items: list[MusicResponse]
    total: int

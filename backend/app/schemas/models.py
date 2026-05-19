from pydantic import BaseModel


class ModelInfoResponse(BaseModel):
    key: str
    display_name: str
    description: str
    vram_gb: float
    quality: str
    speed: str
    embedding_dim: int | None = None
    installed: bool = False


class ModelCatalogResponse(BaseModel):
    vocal_separation: list[ModelInfoResponse]
    style_extraction: list[ModelInfoResponse]
    music_generation: list[ModelInfoResponse]

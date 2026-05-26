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
    provider_mode: str = "unknown"  # "real" | "mock" | "unavailable"
    pros: list[str] | None = None
    cons: list[str] | None = None


class ModelCatalogResponse(BaseModel):
    vocal_separation: list[ModelInfoResponse]
    style_extraction: list[ModelInfoResponse]
    music_generation: list[ModelInfoResponse]
    svs: list[ModelInfoResponse] | None = None

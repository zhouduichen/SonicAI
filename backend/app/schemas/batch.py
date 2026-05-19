from pydantic import BaseModel, Field


class BatchGenerateRequest(BaseModel):
    style_vector_id: int
    prompts: list[str] = Field(min_length=1, max_length=5)
    music_gen_models: list[str] = Field(min_length=1, max_length=5)


class BatchTaskInfo(BaseModel):
    task_id: str
    prompt: str
    model: str
    status: str = "pending"


class BatchGenerateResponse(BaseModel):
    batch_id: str
    tasks: list[BatchTaskInfo]


class BatchCellInfo(BaseModel):
    task_id: str
    prompt: str
    model: str
    status: str  # pending, generating, completed, failed
    music_id: int | None = None
    file_path: str | None = None


class BatchStatusResponse(BaseModel):
    batch_id: str
    cells: list[BatchCellInfo]
    total: int
    completed: int

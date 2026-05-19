from pydantic import BaseModel, Field


class BlendItem(BaseModel):
    style_vector_id: int
    weight: float = Field(ge=0.0, le=1.0, default=1.0)


class BlendGenerateRequest(BaseModel):
    blends: list[BlendItem]
    text_prompt: str
    music_gen_model: str = "musicgen_small"


class BlendGenerateResponse(BaseModel):
    task_id: str
    message: str = "Blend generation started"
    music_gen_model: str = "musicgen_small"
    num_blends: int


class BlendPreset(BaseModel):
    key: str
    name: str
    description: str
    weights: list[float]
    num_styles: int


BLEND_PRESETS: list[BlendPreset] = [
    BlendPreset(key="equal", name="均衡融合", description="所有风格各占相等权重，和谐叠加", weights=[], num_styles=0),
    BlendPreset(key="dominant_a", name="A风格主导 (70%)", description="第一个风格为基底，第二个风格点缀", weights=[0.70, 0.30], num_styles=2),
    BlendPreset(key="dominant_b", name="B风格主导 (70%)", description="第二个风格为基底，第一个风格点缀", weights=[0.30, 0.70], num_styles=2),
    BlendPreset(key="gentle_blend", name="渐进过渡 (80/20)", description="微弱混合，保留主体风格特征", weights=[0.80, 0.20], num_styles=2),
    BlendPreset(key="triangle", name="三角平衡", description="三种风格均衡调配，各占三分之一", weights=[0.34, 0.33, 0.33], num_styles=3),
    BlendPreset(key="dramatic", name="强烈对比 (60/25/15)", description="主风格主导，次风格辅助，第三风格点缀", weights=[0.60, 0.25, 0.15], num_styles=3),
]

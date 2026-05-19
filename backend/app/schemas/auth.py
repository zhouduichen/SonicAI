from pydantic import BaseModel, EmailStr, field_validator


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str | None = None
    display_name: str | None = None

    @field_validator("username")
    @classmethod
    def username_min_length(cls, v: str) -> str:
        if len(v.strip()) < 3:
            raise ValueError("用户名至少 3 个字符")
        return v.strip()

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("密码至少 6 个字符")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str | None = None
    display_name: str | None = None

    class Config:
        from_attributes = True

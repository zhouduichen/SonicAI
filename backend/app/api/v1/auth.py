from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.services.auth_service import authenticate_user, register_user
from app.core.deps import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user and return JWT token."""
    return authenticate_user(db, body.username, body.password)


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user account."""
    return register_user(
        db,
        username=body.username,
        password=body.password,
        email=body.email,
        display_name=body.display_name,
    )

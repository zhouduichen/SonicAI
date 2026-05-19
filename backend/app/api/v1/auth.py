from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.schemas.auth import LoginRequest, TokenResponse
from app.services.auth_service import authenticate_user
from app.core.deps import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user and return JWT token."""
    return authenticate_user(db, body.username, body.password)

import os
from sqlalchemy.orm import Session
from app.models.audio_asset import AudioAsset
from app.models.user import User
from app.core.config import get_settings

settings = get_settings()


def save_upload_and_create_asset(
    db: Session, user: User, file_name: str, content: bytes,
    vocal_sep_model: str = "demucs_htdemucs",
) -> AudioAsset:
    """Save uploaded file to disk and create DB record."""

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    # Create asset record
    asset = AudioAsset(
        user_id=user.id,
        file_name=file_name,
        file_path="",  # Will be set after file save
        status="processing",
        vocal_sep_model=vocal_sep_model,
    )
    db.add(asset)
    db.flush()  # Get asset.id

    # Save file: uploads/{user_id}/{asset_id}/{file_name}
    asset_dir = os.path.join(settings.UPLOAD_DIR, str(user.id), str(asset.id))
    os.makedirs(asset_dir, exist_ok=True)
    file_path = os.path.join(asset_dir, file_name)

    with open(file_path, "wb") as f:
        f.write(content)

    asset.file_path = file_path
    db.commit()
    db.refresh(asset)

    return asset

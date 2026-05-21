import os
import re
from sqlalchemy.orm import Session
from app.models.audio_asset import AudioAsset
from app.models.user import User
from app.core.config import get_settings

settings = get_settings()


def _sanitize_filename(name: str) -> str:
    """Strip directory traversal and dangerous characters from filename."""
    # os.path.basename strips any ../ path components
    safe = os.path.basename(name)
    # Replace anything that's not alphanumeric, dot, dash, underscore, or CJK
    safe = re.sub(r'[^\w.\-一-鿿]', '_', safe, flags=re.UNICODE)
    # Prevent hidden files and empty names
    if safe.startswith('.') or not safe.strip('._-'):
        safe = 'audio_' + safe.lstrip('._-') if safe.strip('._-') else 'audio_upload.mp3'
    return safe


def save_upload_and_create_asset(
    db: Session, user: User, file_name: str, content: bytes,
    vocal_sep_model: str = "demucs_htdemucs",
) -> AudioAsset:
    """Save uploaded file to disk and create DB record."""

    safe_name = _sanitize_filename(file_name)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    # Create asset record
    asset = AudioAsset(
        user_id=user.id,
        file_name=safe_name,
        file_path="",
        status="processing",
        vocal_sep_model=vocal_sep_model,
    )
    db.add(asset)
    db.flush()

    # Save file: uploads/{user_id}/{asset_id}/{safe_name}
    asset_dir = os.path.join(settings.UPLOAD_DIR, str(user.id), str(asset.id))
    os.makedirs(asset_dir, exist_ok=True)
    file_path = os.path.join(asset_dir, safe_name)

    with open(file_path, "wb") as f:
        f.write(content)

    asset.file_path = file_path
    db.commit()
    db.refresh(asset)

    return asset

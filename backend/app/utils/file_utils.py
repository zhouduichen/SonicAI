import os

ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".opus"}
MAX_FILE_SIZE_MB = 100


def validate_audio_file(filename: str, file_size: int) -> str | None:
    """Return error message if invalid, None if valid."""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        return f"不支持的音频格式: {ext}。支持: {', '.join(ALLOWED_AUDIO_EXTENSIONS)}"

    if file_size > MAX_FILE_SIZE_MB * 1024 * 1024:
        return f"文件过大，最大 {MAX_FILE_SIZE_MB}MB"

    return None

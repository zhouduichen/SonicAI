from celery import Celery
from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "aimusic",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=False,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    broker_pool_limit=10,
    result_backend_max_connections=20,
)

# Auto-discover tasks from the audio_pipeline module
celery_app.autodiscover_tasks(["app.tasks.audio_pipeline"])

#!/bin/bash
set -e

echo "=== SonicAI Backend ==="

# Ensure data directories exist
mkdir -p /app/data/uploads /app/data/generated

# Check GPU
if nvidia-smi &>/dev/null 2>&1; then
    echo "GPU detected via nvidia-smi"
    GPU_COUNT=$(nvidia-smi --query-gpu=name --format=csv,noheader | wc -l)
    nvidia-smi --query-gpu=name --format=csv,noheader | while read -r gpu; do
        echo "  GPU: $gpu"
    done
else
    echo "No GPU detected - running CPU-only mode"
fi

# Read tier from env
TIER="${SONICAI_HARDWARE_TIER:-mid}"
echo "Hardware tier: $TIER"

# Run database migrations (required for production; auto-migrate only active in DEBUG mode)
echo "Running Alembic migrations..."
alembic upgrade head 2>&1 || echo "WARNING: Alembic migration failed — check DATABASE_URL"

# Start supervisor (uvicorn + celery worker)
mkdir -p /etc/supervisor/conf.d
cat > /etc/supervisor/conf.d/sonicai.conf << 'SUPERVISOR_EOF'
[supervisord]
nodaemon=true
logfile=/dev/stdout
logfile_maxbytes=0

[program:uvicorn]
command=python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
directory=/app
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
autostart=true
autorestart=true

[program:celery]
command=python3 -m celery -A app.tasks.celery_app worker -l info -P solo --concurrency=1
directory=/app
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
autostart=true
autorestart=true
startsecs=5
SUPERVISOR_EOF

echo "Starting API server + Celery worker via supervisor..."
exec supervisord -c /etc/supervisor/conf.d/sonicai.conf

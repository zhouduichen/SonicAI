#!/bin/bash
set -e

echo "=== SonicAI Backend ==="

# Check GPU
if nvidia-smi &>/dev/null; then
    echo "GPU detected via nvidia-smi"
else
    echo "No GPU detected — running CPU-only mode"
fi

# Read tier from env
TIER="${SONICAI_HARDWARE_TIER:-ultra}"
echo "Hardware tier: $TIER"

# Setup ONNX models if CPU tier and models not installed
if [ "$TIER" = "cpu" ]; then
    if [ ! -f "$HOME/.sonicai/models/model_manifest.json" ]; then
        echo "CPU tier selected — installing ONNX models..."
        python3 /app/scripts/setup_cpu_models.py || echo "ONNX setup failed, will use mock fallback"
    else
        echo "ONNX models already installed"
    fi
fi

# Start supervisor (uvicorn + celery worker)
cat > /etc/supervisor/conf.d/sonicai.conf << 'SUPERVISOR_EOF'
[supervisord]
nodaemon=true

[program:uvicorn]
command=python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
directory=/app
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:celery]
command=python3 -m celery -A app.tasks.celery_app worker -l info -P solo
directory=/app
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
SUPERVISOR_EOF

exec supervisord -c /etc/supervisor/conf.d/sonicai.conf

FROM nvidia/cuda:12.4.0-runtime-ubuntu22.04

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3-pip python3.10-dev \
    ffmpeg supervisor curl build-essential \
    && ln -sf /usr/bin/python3.10 /usr/bin/python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Layer 1: Python dependencies (cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Layer 2: Pre-cache AI model weights (~4 GB, cached unless precache script changes)
COPY precache_models.py .
RUN python3 precache_models.py

# Layer 3: Application code
COPY . .

RUN mkdir -p /app/data/uploads /app/data/generated
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]

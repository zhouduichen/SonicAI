"""Start SonicAI with self-healing: kill stale processes, clean caches, migrate DB, then launch.

    python start_all.py              # sync mode:  backend + frontend
    python start_all.py --async      # async mode: redis + backend + celery + frontend
    python start_all.py --reset      # also delete DB for fresh start (loses old data)
    python start_all.py --clean      # also delete uploads/generated/cache dirs

Nothing else to do — just run this one command and wait for the services to come up.
"""

from __future__ import annotations

import subprocess
import sys
import os
import re
import time
import signal
import threading
import shutil
import http.client
import json

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(ROOT, "backend")
FRONTEND = os.path.join(ROOT, "frontend")
VENV_PYTHON = os.path.join(
    ROOT,
    ".venv",
    "Scripts" if sys.platform == "win32" else "bin",
    "python.exe" if sys.platform == "win32" else "python",
)
BOOT_LOG = os.path.join(ROOT, "start_all.log")

if (
    os.path.exists(VENV_PYTHON)
    and os.path.abspath(sys.executable).lower() != os.path.abspath(VENV_PYTHON).lower()
    and os.environ.get("SONICAI_NO_VENV_REEXEC") != "1"
):
    print(f"[BOOT] Switching to project Python: {VENV_PYTHON}")
    os.execv(VENV_PYTHON, [VENV_PYTHON, os.path.abspath(__file__), *sys.argv[1:]])

RESET = "--reset" in sys.argv
CLEAN = "--clean" in sys.argv
ASYNC = "--async" in sys.argv

processes: list[tuple[str, subprocess.Popen]] = []

LOG_PATHS = {
    "Backend": os.path.join(ROOT, "backend-api.out.log"),
    "Celery": os.path.join(ROOT, "celery.log"),
    "Redis": os.path.join(ROOT, "redis.log"),
    "Frontend": os.path.join(FRONTEND, "frontend-dev.out.log"),
}


# ── helpers ──────────────────────────────────────────────────────────────────

def _log(name: str, msg: str):
    ts = time.strftime("%H:%M:%S")
    line = f"[{ts}] [{name}] {msg}"
    try:
        with open(BOOT_LOG, "a", encoding="utf-8", errors="replace") as f:
            f.write(line + "\n")
    except Exception:
        pass
    print(line)


def _find_node() -> str:
    candidates = [
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
    ]
    if sys.platform == "win32":
        for c in candidates:
            if os.path.exists(c):
                return c
    return "node"


def _find_npm() -> str:
    if sys.platform == "win32":
        npm_cmd = os.path.join(os.path.dirname(_find_node()), "npm.cmd")
        if os.path.exists(npm_cmd):
            return npm_cmd
    return "npm"


def _check_ai_runtime() -> None:
    """Print the exact Python + CUDA status before starting services."""
    _log("RUNTIME", f"Python: {sys.executable}")
    try:
        import torch
    except Exception as e:
        _log("RUNTIME", f"PyTorch unavailable ({type(e).__name__}: {e})")
        _log("RUNTIME", "Run install.bat so SonicAI uses .venv with CUDA PyTorch.")
        return

    cuda_ok = bool(torch.cuda.is_available())
    cuda_version = getattr(torch.version, "cuda", None)
    _log("RUNTIME", f"PyTorch: {torch.__version__} | CUDA runtime: {cuda_version} | cuda_available={cuda_ok}")
    if cuda_ok:
        count = torch.cuda.device_count()
        for idx in range(count):
            _log("RUNTIME", f"GPU {idx}: {torch.cuda.get_device_name(idx)}")
        return

    if shutil.which("nvidia-smi"):
        _log("RUNTIME", "NVIDIA driver is visible, but this PyTorch build cannot use CUDA.")
        _log("RUNTIME", "Re-run install.bat to install the CUDA wheel into the project .venv.")
    else:
        _log("RUNTIME", "nvidia-smi not found; NVIDIA driver/GPU is not visible to this process.")


def _check_required_imports() -> bool:
    """Fail fast when the project venv is missing runtime dependencies."""
    required = [
        "fastapi",
        "uvicorn",
        "sqlalchemy",
        "redis",
        "celery",
        "numpy",
        "soundfile",
        "transformers",
        "demucs",
    ]
    missing: list[str] = []
    for module in required:
        try:
            __import__(module)
        except Exception as e:
            missing.append(f"{module} ({type(e).__name__}: {e})")
    if not missing:
        _log("RUNTIME", "Required backend dependencies: OK")
        return True

    _log("RUNTIME", "Required backend dependencies are missing:")
    for item in missing:
        _log("RUNTIME", f"  - {item}")
    _log("RUNTIME", "Run install.bat, then start again with python start_all.py --async.")
    return False


def _kill_port(port: int, label: str = ""):
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(1)
    busy = sock.connect_ex(("127.0.0.1", port)) == 0
    sock.close()
    if not busy:
        return True

    _log("CLEAN", f"Port {port} in use{(' (' + label + ')') if label else ''}, killing...")
    if sys.platform == "win32":
        try:
            result = subprocess.run(
                f'netstat -ano | findstr :{port}', shell=True,
                capture_output=True, text=True
            )
            for line in result.stdout.splitlines():
                m = re.search(r"LISTENING\s+(\d+)", line)
                if m:
                    subprocess.run(
                        f"taskkill /F /T /PID {m.group(1)}", shell=True,
                        capture_output=True
                    )
            time.sleep(1)
            return True
        except Exception:
            return False
    else:
        try:
            result = subprocess.run(["lsof", "-ti", f":{port}"], capture_output=True, text=True)
            for pid in result.stdout.strip().splitlines():
                subprocess.run(["kill", "-9", pid])
            time.sleep(1)
            return True
        except Exception:
            return False


def _kill_windows_command_matches(snippets: list[str], label: str) -> None:
    if sys.platform != "win32":
        return

    escaped = ", ".join("'" + s.replace("'", "''") + "'" for s in snippets)
    script = f"""
$selfPid = {os.getpid()}
$snippets = @({escaped})
Get-CimInstance Win32_Process | Where-Object {{
    $_.ProcessId -ne $selfPid -and $_.CommandLine -and $_.Name -like 'python*.exe'
}} | ForEach-Object {{
    $cmd = $_.CommandLine
    $match = $false
    foreach ($snippet in $snippets) {{
        if ($cmd -like "*$snippet*") {{ $match = $true; break }}
    }}
    if ($match) {{
        Write-Output "$($_.ProcessId) $($_.Name)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }}
}}
"""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", script],
            capture_output=True,
            text=True,
            timeout=15,
        )
        killed = [line.strip() for line in result.stdout.splitlines() if line.strip()]
        if killed:
            _log("CLEAN", f"Killed stale {label}: {', '.join(killed)}")
    except Exception as e:
        _log("CLEAN", f"Could not clean stale {label}: {e}")


def _wait_http(url: str, timeout: int = 30) -> bool:
    """Poll an HTTP URL until it returns 200 or timeout expires."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            conn = http.client.HTTPConnection(url.replace("http://", "").split("/")[0], timeout=3)
            conn.request("GET", "/" + "/".join(url.split("/")[3:]) if "/" in url[8:] else "/")
            resp = conn.getresponse()
            conn.close()
            if resp.status == 200:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def _is_aimusic_backend_health(status: int, body: bytes) -> bool:
    if status != 200:
        return False
    try:
        payload = json.loads(body.decode("utf-8"))
    except Exception:
        return False
    return payload.get("status") == "healthy"


def _wait_aimusic_backend(timeout: int = 30) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            conn = http.client.HTTPConnection("127.0.0.1:8000", timeout=3)
            conn.request("GET", "/api/health")
            resp = conn.getresponse()
            body = resp.read()
            conn.close()
            if _is_aimusic_backend_health(resp.status, body):
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def _should_remove_frontend_cache(clean: bool) -> bool:
    return clean


def _find_redis() -> str | None:
    win_path = os.path.join(ROOT, "redis", "redis-server.exe")
    if sys.platform == "win32" and os.path.exists(win_path):
        return win_path
    if sys.platform != "win32":
        found = shutil.which("redis-server")
        if found:
            return found
        unix_path = os.path.join(ROOT, "redis", "redis-server")
        if os.path.exists(unix_path):
            return unix_path
    return None


def stream_output(name, pipe, log_path=None):
    log_file = None
    if log_path:
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        log_file = open(log_path, "w", encoding="utf-8", errors="replace")
    try:
        for line in iter(pipe.readline, ""):
            line = line.rstrip()
            if line:
                ts = time.strftime("%H:%M:%S")
                rendered = f"[{ts}] [{name}] {line}"
                if log_file:
                    log_file.write(rendered + "\n")
                    log_file.flush()
                # Safe print: replace unencodable chars on GBK consoles (Windows)
                try:
                    print(rendered)
                except UnicodeEncodeError:
                    print(rendered.encode('ascii', errors='replace').decode())
    finally:
        if log_file:
            log_file.close()
        pipe.close()


def start(name, cmd, cwd=None):
    _log(name, "Starting...")
    log_path = LOG_PATHS.get(name)
    if log_path:
        _log(name, f"Log: {log_path}")
    p = subprocess.Popen(
        cmd, cwd=cwd or ROOT,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
        encoding="utf-8", errors="replace",
    )
    processes.append((name, p))
    t = threading.Thread(target=stream_output, args=(name, p.stdout, log_path), daemon=True)
    t.start()
    return p


def ensure_process_alive(name: str, p: subprocess.Popen, wait_seconds: float = 2.0) -> bool:
    time.sleep(wait_seconds)
    code = p.poll()
    if code is None:
        return True
    _log(name, f"Exited during startup with code {code}. Check {LOG_PATHS.get(name, 'console output')}.")
    return False


def _cancel_interrupted_jobs() -> None:
    code = (
        "from app.core.database import SessionLocal\n"
        "from app.services.job_service import cancel_interrupted_jobs\n"
        "db = SessionLocal()\n"
        "try:\n"
        "    print(cancel_interrupted_jobs(db))\n"
        "finally:\n"
        "    db.close()\n"
    )
    try:
        result = subprocess.run(
            [sys.executable, "-c", code],
            cwd=BACKEND,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except Exception as e:
        _log("JOBS", f"Could not clean interrupted jobs: {e}")
        return

    if result.returncode != 0:
        for line in result.stderr.splitlines():
            if line.strip():
                _log("JOBS", f"[err] {line.strip()}")
        return

    count = "0"
    for line in reversed(result.stdout.splitlines()):
        if line.strip().isdigit():
            count = line.strip()
            break
    _log("JOBS", f"Cancelled {count} interrupted queued/running job(s).")


def cleanup(sig=None, frame=None):
    print(f"\n[---] Shutting down all services...")
    for name, p in processes:
        try:
            p.terminate()
        except Exception:
            pass
    sys.exit(0)


signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)


# ── main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    try:
        with open(BOOT_LOG, "w", encoding="utf-8") as f:
            f.write("")
    except Exception:
        pass
    mode_label = "async (Redis + Celery)" if ASYNC else "sync (no Redis needed)"
    print("=" * 60)
    print(f"  SonicAI  |  {mode_label}")
    print("=" * 60)
    _check_ai_runtime()
    if not _check_required_imports():
        sys.exit(1)

    # ── 1. Clean stale state ──────────────────────────────────────────────────
    print()
    _log("CLEAN", "Stopping stale processes...")
    _kill_windows_command_matches(
        [
            "app.tasks.celery_app",
            "infer\\modules\\train\\train.py",
            "infer/modules/train/train.py",
        ],
        "workers/training processes",
    )
    _kill_port(8000, "backend")
    _kill_port(3000, "frontend")
    _kill_port(6379, "redis")

    next_dir = os.path.join(FRONTEND, ".next")
    if _should_remove_frontend_cache(CLEAN) and os.path.exists(next_dir):
        _log("CLEAN", "Removing frontend build cache...")
        try:
            shutil.rmtree(next_dir)
        except Exception:
            pass

    if CLEAN:
        for d in ["uploads", "generated"]:
            path = os.path.join(BACKEND, d)
            if os.path.exists(path):
                _log("CLEAN", f"Removing {d}/ ...")
                try:
                    shutil.rmtree(path)
                except Exception as e:
                    _log("CLEAN", f"  (could not remove {d}: {e})")
        # Also clean Python bytecode cache
        for root, dirs, files in os.walk(BACKEND):
            if "__pycache__" in dirs:
                d = os.path.join(root, "__pycache__")
                try:
                    shutil.rmtree(d)
                except Exception:
                    pass

    if RESET:
        db_path = os.path.join(BACKEND, "aimusic.db")
        if os.path.exists(db_path):
            _log("CLEAN", f"Deleting {db_path} (--reset)")
            try:
                os.unlink(db_path)
            except Exception as e:
                _log("CLEAN", f"  Could not delete DB: {e}")

    # ── 2. Migrate database ───────────────────────────────────────────────────
    print()
    _log("MIGRATE", "Running Alembic migrations...")
    try:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=BACKEND, capture_output=True, text=True, timeout=30,
        )
        for line in result.stdout.splitlines():
            if line.strip():
                _log("MIGRATE", line.strip())
        if result.returncode != 0:
            # If tables already exist (e.g. from auto-migration), stamp the DB
            # so future migrations apply correctly.
            if "already exists" in result.stderr or "already exists" in result.stdout:
                _log("MIGRATE", "Tables already exist, stamping DB as current...")
                subprocess.run(
                    [sys.executable, "-m", "alembic", "stamp", "head"],
                    cwd=BACKEND, capture_output=True, text=True, timeout=15,
                )
                _log("MIGRATE", "DB stamped — migration state is now current.")
            else:
                for line in result.stderr.splitlines():
                    if line.strip():
                        _log("MIGRATE", f"[err] {line.strip()}")
                _log("MIGRATE", "Migration FAILED — use --reset to start fresh.")
    except Exception as e:
        _log("MIGRATE", f"Migration error: {e}")

    _cancel_interrupted_jobs()

    # ── 3. Start backend ──────────────────────────────────────────────────────
    print()
    backend_proc = start("Backend", [sys.executable, "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"], cwd=BACKEND)
    if not ensure_process_alive("Backend", backend_proc):
        cleanup()

    _log("WAIT", "Waiting for backend to be ready...")
    if _wait_aimusic_backend(timeout=20):
        _log("WAIT", "Backend is ready!")
    else:
        _log("WAIT", "AIMusic backend did not become ready. Check backend-api.out.log and port 8000 conflicts.")
        cleanup()

    # ── 4. Start Redis + Celery (async only) ──────────────────────────────────
    if ASYNC:
        print()
        redis_path = _find_redis()
        if redis_path:
            redis_proc = start("Redis", [redis_path])
            if not ensure_process_alive("Redis", redis_proc, wait_seconds=1.0):
                cleanup()
        else:
            _log("SKIP", "redis-server not found — install Redis or use Docker")

        celery_proc = start("Celery", [
            sys.executable, "-m", "celery",
            "-A", "app.tasks.celery_app", "worker",
            "-P", "solo", "--concurrency=1", "-l", "info",
        ], cwd=BACKEND)
        if not ensure_process_alive("Celery", celery_proc, wait_seconds=3.0):
            cleanup()

    # ── 5. Start frontend ─────────────────────────────────────────────────────
    print()
    _kill_port(3000, "frontend")
    node_exe = _find_node()
    next_cli = os.path.join(FRONTEND, "node_modules", "next", "dist", "bin", "next")

    start("Frontend", [node_exe, next_cli, "dev", "-p", "3000"], cwd=FRONTEND)

    _log("WAIT", "Waiting for frontend to be ready...")
    if _wait_http("http://localhost:3000", timeout=30):
        _log("WAIT", "Frontend is ready!")
    else:
        _log("WAIT", "Frontend still compiling — it'll be ready shortly")

    # ── 6. Done ───────────────────────────────────────────────────────────────
    print()
    print("=" * 60)
    print(f"  Mode:       {mode_label}")
    print(f"  Backend:    http://127.0.0.1:8000/docs")
    print(f"  Frontend:   http://localhost:3000")
    if ASYNC:
        print(f"  Monitoring: http://localhost:5000 (celery flower)")
    print()
    print("  Tips:")
    print("    python start_all.py --reset   # fresh start (deletes old DB)")
    print("    python start_all.py --clean   # also clean uploads/caches")
    print("    python start_all.py --async   # enable background job queue")
    print("    Ctrl+C to stop everything")
    print("=" * 60)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        cleanup()

"""Start SonicAI with self-healing: kill stale processes, clean caches, migrate DB, then launch.

    python start_all.py              # sync mode:  backend + frontend
    python start_all.py --async      # async mode: redis + backend + celery + frontend
    python start_all.py --reset      # also delete DB for fresh start (loses old data)
    python start_all.py --clean      # also delete uploads/generated/cache dirs

Nothing else to do — just run this one command and wait for the services to come up.
"""

import subprocess
import sys
import os
import re
import time
import signal
import threading
import shutil
import http.client

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(ROOT, "backend")
FRONTEND = os.path.join(ROOT, "frontend")

RESET = "--reset" in sys.argv
CLEAN = "--clean" in sys.argv
ASYNC = "--async" in sys.argv

processes: list[tuple[str, subprocess.Popen]] = []


# ── helpers ──────────────────────────────────────────────────────────────────

def _log(name: str, msg: str):
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] [{name}] {msg}")


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


def stream_output(name, pipe):
    for line in iter(pipe.readline, ""):
        line = line.rstrip()
        if line:
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] [{name}] {line}")
    pipe.close()


def start(name, cmd, cwd=None):
    _log(name, "Starting...")
    p = subprocess.Popen(
        cmd, cwd=cwd or ROOT,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
    )
    processes.append((name, p))
    t = threading.Thread(target=stream_output, args=(name, p.stdout), daemon=True)
    t.start()
    return p


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
    mode_label = "async (Redis + Celery)" if ASYNC else "sync (no Redis needed)"
    print("=" * 60)
    print(f"  SonicAI  |  {mode_label}")
    print("=" * 60)

    # ── 1. Clean stale state ──────────────────────────────────────────────────
    print()
    _log("CLEAN", "Stopping stale processes...")
    _kill_port(8000, "backend")
    _kill_port(3000, "frontend")

    _log("CLEAN", "Removing frontend build cache...")
    next_dir = os.path.join(FRONTEND, ".next")
    if os.path.exists(next_dir):
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
            for line in result.stderr.splitlines():
                if line.strip():
                    _log("MIGRATE", f"[err] {line.strip()}")
            _log("MIGRATE", "Migration FAILED — schema may be stale. Use --reset to start fresh.")
    except Exception as e:
        _log("MIGRATE", f"Migration error: {e}")

    # ── 3. Start backend ──────────────────────────────────────────────────────
    print()
    start("Backend", [sys.executable, "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"], cwd=BACKEND)

    _log("WAIT", "Waiting for backend to be ready...")
    if _wait_http("http://localhost:8000/api/health", timeout=20):
        _log("WAIT", "Backend is ready!")
    else:
        _log("WAIT", "Backend not responding yet — continuing anyway (may need a moment)")

    # ── 4. Start Redis + Celery (async only) ──────────────────────────────────
    if ASYNC:
        print()
        redis_path = _find_redis()
        if redis_path:
            start("Redis", [redis_path])
            time.sleep(1)
        else:
            _log("SKIP", "redis-server not found — install Redis or use Docker")

        start("Celery", [
            sys.executable, "-m", "celery",
            "-A", "app.tasks.celery_app", "worker",
            "-l", "info", "-P", "solo",
        ], cwd=BACKEND)
        time.sleep(1)

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
    print(f"  Backend:    http://localhost:8000/docs")
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

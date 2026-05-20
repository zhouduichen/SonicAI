"""Start SonicAI services in one terminal.

    python start_all.py          # sync mode: backend + frontend only
    python start_all.py --async  # async mode: redis + backend + celery + frontend

With sync mode (default in Settings), no Redis or Celery is needed.
"""

import subprocess
import sys
import os
import re
import time
import signal
import threading
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(ROOT, "backend")
FRONTEND = os.path.join(ROOT, "frontend")
processes = []

ASYNC = "--async" in sys.argv


def _find_node() -> str:
    """Return the full path to node.exe, falling back to 'node' on PATH."""
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
    """Return npm.cmd path on Windows, or 'npm' on Unix."""
    if sys.platform == "win32":
        npm_cmd = os.path.join(os.path.dirname(_find_node()), "npm.cmd")
        if os.path.exists(npm_cmd):
            return npm_cmd
    return "npm"


def _kill_port(port: int):
    """Kill the process occupying the given port (returns True if freed)."""
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(1)
    busy = sock.connect_ex(("127.0.0.1", port)) == 0
    sock.close()
    if not busy:
        return True  # port is already free

    if sys.platform == "win32":
        try:
            result = subprocess.run(
                f'netstat -ano | findstr :{port}', shell=True,
                capture_output=True, text=True
            )
            for line in result.stdout.splitlines():
                m = re.search(r"LISTENING\s+(\d+)", line)
                if m:
                    pid = m.group(1)
                    print(f"  [WARN] Port {port} occupied by PID {pid}, reclaiming...")
                    subprocess.run(
                        f"taskkill /F /T /PID {pid}", shell=True,
                        capture_output=True
                    )
                    return True
            return False
        except Exception:
            return False
    else:
        try:
            result = subprocess.run(
                ["lsof", "-ti", f":{port}"], capture_output=True, text=True
            )
            pid = result.stdout.strip()
            if pid:
                print(f"  [WARN] Port {port} occupied by PID {pid}, reclaiming...")
                subprocess.run(["kill", "-9", pid])
                return True
            return False
        except Exception:
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
        print(f"[{name}] {line.rstrip()}")
    pipe.close()


def start(name, cmd, cwd=None):
    print(f"  [{name}] Starting...")
    p = subprocess.Popen(
        cmd, cwd=cwd or ROOT,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
    )
    processes.append((name, p))
    t = threading.Thread(target=stream_output, args=(name, p.stdout), daemon=True)
    t.start()
    return p


def cleanup(sig=None, frame=None):
    print("\nShutting down all services...")
    for name, p in processes:
        p.terminate()
    sys.exit(0)


signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

if __name__ == "__main__":
    mode = "异步(队列)" if ASYNC else "同步(即时)"
    print("=" * 50)
    print(f"  SonicAI — {mode}模式")
    print("=" * 50)

    # Backend API (always needed)
    start("Backend", [sys.executable, "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"], cwd=BACKEND)
    time.sleep(1.5)

    if ASYNC:
        # Redis
        redis_path = _find_redis()
        if redis_path:
            start("Redis", [redis_path])
        else:
            print("  [Redis] SKIP: redis-server not found (install Redis or use Docker)")
        time.sleep(1)

        # Celery worker
        start("Celery", [sys.executable, "-m", "celery", "-A", "app.tasks.celery_app", "worker", "-l", "info", "-P", "solo"], cwd=BACKEND)
        time.sleep(1)

    # Frontend (always needed) — reclaim port 3000 first
    _kill_port(3000)
    node_exe = _find_node()
    next_cli = os.path.join(FRONTEND, "node_modules", "next", "dist", "bin", "next")
    start("Frontend", [node_exe, next_cli, "dev", "-p", "3000"], cwd=FRONTEND)

    print()
    print("=" * 50)
    print(f"  模式: {mode}")
    print(f"  后端 API : http://localhost:8000/docs")
    print(f"  前端界面 : http://localhost:3000")
    if ASYNC:
        print(f"  控制面板 : http://localhost:5000")
    print("  Ctrl+C 停止全部")
    print("=" * 50)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        cleanup()

"""SonicAI Service Control Panel — Start/stop all services from a web UI."""

import subprocess
import sys
import os
import time
import json
import threading
import signal
from http.server import HTTPServer, BaseHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(ROOT, "backend")
FRONTEND = os.path.join(ROOT, "frontend")

def _find_redis() -> str | None:
    """Find redis-server executable, platform-aware."""
    # Windows: bundled redis-server.exe
    win_path = os.path.join(ROOT, "redis", "redis-server.exe")
    if sys.platform == "win32" and os.path.exists(win_path):
        return win_path
    # Unix: check system PATH
    if sys.platform != "win32":
        import shutil
        found = shutil.which("redis-server")
        if found:
            return found
    # Linux/macOS fallback: bundled binary
    if sys.platform != "win32":
        unix_path = os.path.join(ROOT, "redis", "redis-server")
        if os.path.exists(unix_path):
            return unix_path
    return None

REDIS = _find_redis()

services = {
    "redis": {"proc": None, "label": "Redis", "port": 6379},
    "backend": {"proc": None, "label": "Backend API", "port": 8000},
    "celery": {"proc": None, "label": "Celery Worker", "port": None},
    "frontend": {"proc": None, "label": "Frontend", "port": 3000},
}


def _stream(name, pipe):
    for line in iter(pipe.readline, ""):
        pass  # silently consume
    pipe.close()


def is_port_open(port):
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.5)
    try:
        s.connect(("127.0.0.1", port))
        s.close()
        return True
    except Exception:
        return False


def start_service(name):
    s = services[name]
    if s["proc"] and s["proc"].poll() is None:
        return False, "already running"

    try:
        if name == "redis":
            if REDIS and os.path.exists(REDIS):
                s["proc"] = subprocess.Popen(
                    [REDIS], cwd=os.path.dirname(REDIS),
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
                )
        elif name == "backend":
            s["proc"] = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
                cwd=BACKEND, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
            )
        elif name == "celery":
            s["proc"] = subprocess.Popen(
                [sys.executable, "-m", "celery", "-A", "app.tasks.celery_app", "worker", "-l", "info", "-P", "solo"],
                cwd=BACKEND, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
            )
        elif name == "frontend":
            s["proc"] = subprocess.Popen(
                ["npm", "run", "dev"], cwd=FRONTEND,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                shell=True
            )
        t = threading.Thread(target=_stream, args=(name, s["proc"].stdout), daemon=True)
        t.start()
        time.sleep(0.5)
        return True, "started"
    except Exception as e:
        return False, str(e)


def stop_service(name):
    s = services[name]
    if s["proc"] is None or s["proc"].poll() is not None:
        s["proc"] = None
        return False, "not running"
    try:
        s["proc"].terminate()
        try:
            s["proc"].wait(timeout=5)
        except subprocess.TimeoutExpired:
            s["proc"].kill()
        s["proc"] = None
        return True, "stopped"
    except Exception as e:
        return False, str(e)


def get_status():
    result = {}
    for name, s in services.items():
        running = s["proc"] is not None and s["proc"].poll() is None
        port_ok = is_port_open(s["port"]) if s["port"] else None
        result[name] = {
            "label": s["label"],
            "running": running,
            "port": s["port"],
            "port_open": port_ok,
        }
    return result


HTML = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SonicAI Control Panel</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Plus Jakarta Sans','Segoe UI',sans-serif;background:#0d0d0d;color:#f2f2f2;min-height:100dvh;display:flex;align-items:center;justify-content:center}
.panel{background:#141414;border:1px solid #262626;border-radius:20px;padding:40px;max-width:480px;width:90%}
h1{font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:28px;color:#d4a853;margin-bottom:4px}
.sub{color:#666;font-size:13px;margin-bottom:32px}
.service{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid #1c1c1c}
.service:last-child{border-bottom:none}
.name{font-size:14px;font-weight:500}
.port{font-size:11px;color:#666;font-family:monospace;margin-top:2px}
.status{font-size:11px;font-family:monospace;letter-spacing:0.05em;margin-right:12px}
.status.ok{color:#22c55e}
.status.off{color:#666}
.btn{padding:8px 20px;border-radius:9999px;border:none;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;letter-spacing:0.03em;transition:all 0.2s}
.btn-start{background:#d4a853;color:#0d0d0d}
.btn-start:hover{background:#e8c267}
.btn-stop{background:#262626;color:#a0a0a0}
.btn-stop:hover{background:#333;color:#f2f2f2}
.btn:disabled{opacity:0.3;cursor:not-allowed}
.actions{margin-top:32px;display:flex;gap:10px}
.actions .btn{flex:1;text-align:center;padding:12px}
.links{margin-top:20px;display:flex;gap:16px;justify-content:center}
.links a{color:#d4a853;font-size:12px;text-decoration:none;font-family:monospace}
.links a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="panel">
<h1>SonicAI</h1>
<p class="sub">Service Control Panel</p>
<div id="services"></div>
<div class="actions">
  <button class="btn btn-start" onclick="action('start_all')">Start All</button>
  <button class="btn btn-stop" onclick="action('stop_all')">Stop All</button>
</div>
<div class="links">
  <a href="http://localhost:3000" target="_blank">Frontend</a>
  <a href="http://localhost:8000/docs" target="_blank">API Docs</a>
</div>
</div>
<script>
function render(status) {
  const order = ['redis','backend','celery','frontend'];
  let html = '';
  for (const id of order) {
    const s = status[id];
    const running = s.running || s.port_open;
    const cls = running ? 'ok' : 'off';
    const label = running ? 'RUNNING' : 'OFF';
    html += '<div class="service">' +
      '<div><div class="name">'+s.label+'</div>'+
      (s.port ? '<div class="port">Port '+s.port+'</div>' : '') +
      '</div>' +
      '<div style="display:flex;align-items:center">' +
      '<span class="status '+cls+'">'+label+'</span>' +
      (running
        ? '<button class="btn btn-stop" onclick="action(\'stop\',\''+id+'\')">Stop</button>'
        : '<button class="btn btn-start" onclick="action(\'start\',\''+id+'\')">Start</button>'
      ) +
      '</div></div>';
  }
  document.getElementById('services').innerHTML = html;
}
async function action(act, id) {
  const res = await fetch('/api/'+act+(id?'/'+id:''));
  const data = await res.json();
  render(data.status);
}
async function poll() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    render(data.status);
  } catch(e) {}
}
poll(); setInterval(poll, 2000);
</script>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def _json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _html(self):
        body = HTML.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.rstrip("/")
        if path == "" or path == "/":
            return self._html()
        if path == "/api/status":
            return self._json({"status": get_status()})

        parts = path.split("/")
        if len(parts) >= 3 and parts[1] == "api" and parts[2] == "start":
            name = parts[3] if len(parts) > 3 else None
            if name == "all":
                for n in services:
                    start_service(n)
            elif name in services:
                start_service(name)
            return self._json({"ok": True, "status": get_status()})

        if len(parts) >= 3 and parts[1] == "api" and parts[2] == "stop":
            name = parts[3] if len(parts) > 3 else None
            if name == "all":
                for n in services:
                    stop_service(n)
            elif name in services:
                stop_service(name)
            return self._json({"ok": True, "status": get_status()})

        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        pass  # quiet


def cleanup(sig=None, frame=None):
    print("\nStopping all services...")
    for name in services:
        stop_service(name)
    sys.exit(0)


signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

if __name__ == "__main__":
    print("=" * 50)
    print("  SonicAI — Starting all services...")
    print("=" * 50)

    # Auto-start all services
    for name in ["redis", "backend", "celery", "frontend"]:
        if name == "redis" and not REDIS:
            print(f"  [Redis] SKIP: redis-server not found (install Redis or use Docker)")
            continue
        ok, msg = start_service(name)
        print(f"  [{services[name]['label']}] {'OK' if ok else 'FAIL: '+msg}")
        time.sleep(1)

    server = HTTPServer(("0.0.0.0", 5000), Handler)
    print("=" * 50)
    print("  All services starting...")
    print("  Control : http://localhost:5000")
    print("  Frontend: http://localhost:3000")
    print("  Backend : http://localhost:8000/docs")
    print("  Ctrl+C to stop all")
    print("=" * 50)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        cleanup()

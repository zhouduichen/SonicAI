import { NextRequest, NextResponse } from "next/server";
import { spawn, type ChildProcess } from "child_process";
import net from "net";
import path from "path";
import fs from "fs";

declare global {
  var __backendProcess: ChildProcess | null | undefined;
  var __lastServiceAction: number | undefined;
}

function probePort(port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(timeoutMs);
    sock
      .on("connect", () => { sock.destroy(); resolve(true); })
      .on("error", () => { sock.destroy(); resolve(false); })
      .on("timeout", () => { sock.destroy(); resolve(false); })
      .connect(port, "127.0.0.1");
  });
}

function resolveBackendDir(): string {
  return path.resolve(process.cwd(), "..", "backend");
}

function findPython(): string {
  const isWin = process.platform === "win32";
  if (!isWin) return "python3";

  const candidates = [
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python313", "python.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python312", "python.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python311", "python.exe"),
    "C:\\Program Files\\Python313\\python.exe",
    "C:\\Program Files\\Python312\\python.exe",
    "C:\\Python313\\python.exe",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "python"; // fallback
}

function findPidByPort(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const cmd = spawn("cmd", ["/c", `netstat -ano | findstr :${port}`], {
      shell: false,
      windowsHide: true,
      stdio: "pipe",
    });
    let output = "";
    cmd.stdout?.on("data", (data: Buffer) => { output += data.toString(); });
    cmd.on("close", () => {
      const match = output.match(/LISTENING\s+(\d+)/);
      resolve(match ? match[1] : null);
    });
  });
}

function rateLimited(): boolean {
  const now = Date.now();
  if (globalThis.__lastServiceAction && now - globalThis.__lastServiceAction < 1000) {
    return true;
  }
  globalThis.__lastServiceAction = now;
  return false;
}

async function startBackend(): Promise<{ ok: boolean; message: string }> {
  const running = await probePort(8000);
  if (running) {
    return { ok: true, message: "already_running" };
  }

  const backendDir = resolveBackendDir();
  const pythonExe = findPython();

  try {
    globalThis.__backendProcess = spawn(
      pythonExe,
      ["-m", "uvicorn", "app.main:app", "--port", "8000"],
      {
        cwd: backendDir,
        stdio: "pipe",
        shell: false,
        windowsHide: true,
      },
    );

    globalThis.__backendProcess.on("exit", () => {
      globalThis.__backendProcess = null;
    });
    globalThis.__backendProcess.on("error", () => {
      globalThis.__backendProcess = null;
    });

    return { ok: true, message: "started" };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return { ok: false, message: `python not found (tried ${pythonExe})` };
    }
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

async function stopBackend(): Promise<{ ok: boolean; message: string }> {
  const proc = globalThis.__backendProcess;

  if (proc && proc.exitCode === null) {
    const pid = proc.pid!;
    const isWindows = process.platform === "win32";

    if (isWindows) {
      try {
        const killer = spawn("taskkill", ["/F", "/T", "/PID", String(pid)], { shell: true, windowsHide: true });
        await new Promise<void>((resolve) => killer.on("exit", () => resolve()));
      } catch {
        globalThis.__backendProcess = null;
        return { ok: false, message: "failed_to_kill_process" };
      }
    } else {
      proc.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          try { proc.kill("SIGKILL"); } catch {}
          resolve();
        }, 3000);
        proc.on("exit", () => { clearTimeout(timeout); resolve(); });
      });
    }

    globalThis.__backendProcess = null;
    return { ok: true, message: "stopped" };
  }

  // Process ref lost — check port
  const running = await probePort(8000);
  if (!running) {
    globalThis.__backendProcess = null;
    return { ok: true, message: "not_running" };
  }

  // Process ref lost but port is busy — find PID by port and kill it
  if (process.platform === "win32") {
    const pid = await findPidByPort(8000);
    if (pid) {
      try {
        const killer = spawn("taskkill", ["/F", "/T", "/PID", pid], { shell: true, windowsHide: true });
        await new Promise<void>((resolve) => killer.on("exit", () => resolve()));
      } catch {}
    }
  } else {
    try {
      const killer = spawn("pkill", ["-f", "uvicorn.*8000"]);
      await new Promise<void>((resolve) => killer.on("exit", () => resolve()));
    } catch {}
  }

  globalThis.__backendProcess = null;
  return { ok: true, message: "force_stopped" };
}

export async function GET() {
  const running = await probePort(8000);
  const managed = globalThis.__backendProcess != null && globalThis.__backendProcess.exitCode === null;
  return NextResponse.json({
    backend: { running, port: 8000, managed },
  });
}

export async function POST(request: NextRequest) {
  if (rateLimited()) {
    return NextResponse.json({ ok: false, message: "rate_limited" }, { status: 429 });
  }

  let action: string;
  try {
    const body = await request.json();
    action = body.action;
  } catch {
    return NextResponse.json({ ok: false, message: "invalid_body" }, { status: 400 });
  }

  if (action !== "start" && action !== "stop") {
    return NextResponse.json({ ok: false, message: "invalid_action" }, { status: 400 });
  }

  const result = action === "start" ? await startBackend() : await stopBackend();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

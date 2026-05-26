const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

// Dev auto-login keeps the local one-click app usable without a separate login UI.
// Production stays locked down unless NEXT_PUBLIC_DEMO_MODE is explicitly true.
const DEMO_MODE_SETTING = process.env.NEXT_PUBLIC_DEMO_MODE;
const DEMO_MODE =
  DEMO_MODE_SETTING === "true" ||
  (DEMO_MODE_SETTING !== "false" && process.env.NODE_ENV !== "production");
const DEFAULT_USER = process.env.NEXT_PUBLIC_AUTH_USER || "admin";
const DEFAULT_PASS = process.env.NEXT_PUBLIC_AUTH_PASS || "admin123";

let cachedToken: string | null = null;
let tokenExpiry = 0;
let loginPromise: Promise<string> | null = null;

export async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "登录失败" }));
    throw new Error(err.detail || `登录失败 (${res.status})`);
  }
  const data = await res.json();
  cachedToken = data.access_token || null;
  tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
  if (!cachedToken) throw new Error("服务器未返回认证令牌");
  return cachedToken;
}

export async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  if (!DEMO_MODE) {
    throw new Error("Not authenticated. Call login() first or enable demo mode.");
  }
  // Deduplicate concurrent login calls (demo mode only)
  if (!loginPromise) {
    loginPromise = login(DEFAULT_USER, DEFAULT_PASS).finally(() => {
      loginPromise = null;
    });
  }
  return loginPromise;
}

export async function authHeaders(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await getToken()}` };
}

export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  let res = await fetch(url, { ...init, headers: { ...init?.headers, ...(await authHeaders()) } });
  if (res.status === 401) {
    cachedToken = null;
    tokenExpiry = 0;
    res = await fetch(url, { ...init, headers: { ...init?.headers, ...(await authHeaders()) } });
  }
  return res;
}

export function clearToken() {
  cachedToken = null;
  tokenExpiry = 0;
}

export { API_BASE };

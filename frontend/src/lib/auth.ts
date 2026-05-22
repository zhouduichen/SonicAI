const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

let cachedToken: string | null = null;
let tokenExpiry = 0;

export async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  if (!res.ok) throw new Error("Auth failed");
  const data = await res.json();
  cachedToken = data.access_token || null;
  tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
  if (!cachedToken) throw new Error("No token in auth response");
  return cachedToken;
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

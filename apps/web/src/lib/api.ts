const BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "production" ? "/api/v1" : "http://localhost:4000/api/v1");

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

async function send(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(`${BASE}${path}`, { ...init, headers, credentials: "include" });
}

let refreshing: Promise<boolean> | null = null;
/** One refresh at a time, so parallel 401s do not rotate the cookie twice (which would trigger reuse detection). */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "include" });
      if (!res.ok) return false;
      setAccessToken((await res.json()).accessToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await send(path, init);
  if (res.status === 401 && !path.startsWith("/auth/") && (await refreshSession())) res = await send(path, init);

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body?.error;
    throw new ApiError(res.status, e?.code ?? "error", e?.message ?? "Request failed", e?.details);
  }
  return body as T;
}

export const post = <T>(path: string, data?: unknown, headers?: Record<string, string>) =>
  api<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data), headers });
export const patch = <T>(path: string, data: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(data) });

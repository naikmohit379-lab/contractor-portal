const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

let accessToken: string | null = null;
export const getAccessToken = () => accessToken;
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

/** Downloads a file from an authenticated endpoint (CSV exports). The token cannot ride on a plain link, so fetch it as a blob. */
export async function downloadFile(path: string, fallbackName: string) {
  let res = await send(path);
  if (res.status === 401 && (await refreshSession())) res = await send(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.error?.code ?? "error", body?.error?.message ?? "The download failed");
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Fetches a protected file as a Blob (photos). Images cannot carry an Authorization header, so they are loaded this way. */
export async function fetchBlob(path: string): Promise<Blob> {
  let res = await send(path);
  if (res.status === 401 && (await refreshSession())) res = await send(path);
  if (!res.ok) throw new ApiError(res.status, "error", "The file could not be loaded");
  return res.blob();
}

/** Uploads one file as the raw request body (not multipart). The server identifies the real type from the bytes. */
export async function uploadFile<T>(path: string, file: File, extraHeaders: Record<string, string> = {}): Promise<T> {
  const init: RequestInit = { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name), ...extraHeaders } };
  let res = await send(path, init);
  if (res.status === 401 && (await refreshSession())) res = await send(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? "error", body?.error?.message ?? "The upload failed");
  return body as T;
}

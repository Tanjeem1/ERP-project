export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  skipRefresh?: boolean;
  idempotent?: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

export function normalizeApiPath(nextPath: string) {
  let path = nextPath;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    const url = new URL(path);
    const allowed = new Set<string>();
    if (typeof window !== "undefined") allowed.add(window.location.origin);
    const configured = process.env.NEXT_PUBLIC_API_ORIGIN;
    if (configured) allowed.add(new URL(configured).origin);
    if (!allowed.has(url.origin)) throw new Error("The API returned an untrusted pagination URL.");
    path = `${url.pathname}${url.search}`;
  }
  if (path.startsWith(API_BASE)) path = path.slice(API_BASE.length);
  return path.startsWith("/") ? path : `/${path}`;
}
let refreshPromise: Promise<boolean> | null = null;

function cookieValue(name: string) {
  if (typeof document === "undefined") return "";
  const entry = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : "";
}

function errorMessage(payload: unknown, status: number) {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    if ("detail" in payload) {
      const detail = (payload as { detail: unknown }).detail;
      if (typeof detail === "string") return detail;
      if (Array.isArray(detail) && typeof detail[0] === "string") return detail[0];
    }
    const messages = Object.values(payload).flatMap((value) => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === "string");
    if (messages.length > 0) return messages.join(" ");
  }
  return `The request could not be completed (${status}).`;
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) return response.json();
  const text = await response.text();
  return text || undefined;
}

function unauthorized() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("nexusledger:unauthorized"));
}

async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch(`${API_BASE}/auth/refresh/`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "X-CSRFToken": cookieValue("csrftoken") },
        body: "{}",
      });
      return response.ok;
    })().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function fetchWithAuth(path: string, options: ApiRequestOptions): Promise<Response> {
  const { skipRefresh = false, idempotent = true, body, headers: providedHeaders, ...init } = options;
  const headers = new Headers(providedHeaders);
  if (body !== undefined && !(body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (options.method && !["GET", "HEAD", "OPTIONS", "TRACE"].includes(options.method.toUpperCase())) {
    headers.set("X-CSRFToken", cookieValue("csrftoken"));
    if (idempotent && !headers.has("Idempotency-Key")) headers.set("Idempotency-Key", crypto.randomUUID());
  }
  const requestInit: RequestInit = {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  };
  const response = await fetch(`${API_BASE}${path}`, requestInit);
  if (response.status !== 401 || skipRefresh || path === "/auth/refresh/") return response;
  if (await refreshSession()) return fetch(`${API_BASE}${path}`, requestInit);
  unauthorized();
  return response;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await fetchWithAuth(path, options);
  const payload = await parseResponse(response);
  if (!response.ok) throw new ApiError(errorMessage(payload, response.status), response.status, payload);
  return payload as T;
}

export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  const response = await fetchWithAuth(path, { method: "GET", idempotent: false });
  if (!response.ok) {
    const payload = await parseResponse(response);
    throw new ApiError(errorMessage(payload, response.status), response.status, payload);
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? "nexusledger-document.pdf";
  return { blob: await response.blob(), filename };
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

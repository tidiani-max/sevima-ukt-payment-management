/** Centralised HTTP client. Same-origin by default (`/api`, reverse-proxied by Nginx / the Vite dev proxy). */
export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");
/** Shows the "demo accounts" helper on the login page. Off unless explicitly enabled at build time. */
export const SHOW_DEMO_ACCOUNTS: boolean = import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === "true";
/** Dispatched on `window` when the server answers 401 for an established session (expired / revoked). */
export const UNAUTHORIZED_EVENT = "app:unauthorized";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The CSRF token is a readable cookie set by the backend; it is echoed in a header on every write (synchroniser token). */
export function csrfToken(cookie: string = typeof document === "undefined" ? "" : document.cookie): string | undefined {
  const hit = cookie.split("; ").find((c) => c.startsWith("XSRF-TOKEN="));
  return hit ? decodeURIComponent(hit.slice("XSRF-TOKEN=".length)) : undefined;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) };
  if (!SAFE_METHODS.has(method)) {
    const token = csrfToken();
    if (token) headers["X-CSRF-Token"] = token;
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    method,
    credentials: "same-origin", // HttpOnly session cookie; tenant identity is derived server-side from it
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { message?: unknown } | null;
    if (res.status === 401 && !path.startsWith("/auth/") && typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, typeof body?.message === "string" ? body.message : res.statusText);
  }
  // Some endpoints (e.g. logout) legitimately return no body.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

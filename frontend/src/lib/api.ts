/**
 * Zola AI — centralised API/WS helper
 * Reads VITE_API_URL and VITE_WS_URL from .env.local (or falls back to localhost)
 */
export const API_BASE =
  import.meta.env.VITE_API_URL as string ?? "http://localhost:8000";

export const WS_BASE =
  import.meta.env.VITE_WS_URL as string ?? "ws://localhost:8000";

/** Typed fetch wrapper */
export async function api<T = unknown>(
  path: string,
  opts?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Post helper */
export function post<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

/** Status response for /api/status/{wallet} */
export interface ZolaStatus {
  wallet: string;
  registered: boolean;
  telegram: boolean;
  twitter: boolean;
  twitter_handle?: string;
}

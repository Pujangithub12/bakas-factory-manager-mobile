// The server address comes from mobile/.env.local (EXPO_PUBLIC_API_URL), not from the sign-in screen.
const serverUrl = (process.env.EXPO_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");

export const getServerUrl = () => serverUrl;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
/** No signal, server down, or timed out. The entry stays on the phone and is sent later. */
export class OfflineError extends Error {}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; token?: string | null; timeoutMs?: number } = {}): Promise<T> {
  if (!serverUrl) throw new OfflineError("Server address is not set");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 15_000);
  let res: Response;
  try {
    res = await fetch(serverUrl + path, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: { "content-type": "application/json", ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctl.signal,
    });
  } catch {
    throw new OfflineError("Cannot reach the server");
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.error ?? `Server error ${res.status}`);
  return json as T;
}

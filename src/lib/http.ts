// Shared fetch helpers: timeout, custom User-Agent, simple retry/backoff, sleep.

export const DEFAULT_TIMEOUT_MS = 10_000;
export const USER_AGENT = "crypto-trend-agent/1.0";

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface FetchOpts {
  timeoutMs?: number;
  headers?: Record<string, string>;
  retries?: number; // extra attempts (0 = single attempt)
}

export async function fetchWithTimeout(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, retries = 0 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
        cache: "no-store",
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      clearTimeout(t);
      lastErr = err;
      if (attempt < retries) await sleep(1000 * (attempt + 1)); // 1s, 2s, ...
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetchWithTimeout(url, opts);
  return (await res.json()) as T;
}

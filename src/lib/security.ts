// Security layer for LLM and third-party interactions.
//
// Two threat surfaces are covered here:
//  1. Prompt injection — untrusted external text (RSS headlines, Reddit posts, trending
//     coin names, competitor content) flows into the Claude prompt. A malicious headline
//     could try to hijack the analyst ("ignore previous instructions…"). We neutralize the
//     structural tokens an injection relies on, cap length, and (in claude.ts) fence the
//     data + instruct the model to treat it strictly as data.
//  2. SSRF / abusive responses — the crawler fetches arbitrary configured URLs. We block
//     non-public targets (loopback/private/link-local/cloud-metadata) and cap response size.
//
// These are defense-in-depth: cheap, bounded guards that keep a single bad input from
// escalating. They are not a substitute for the trust model (static config, no user URLs).

// ----------------------------------------------------------------------------
// 1) Prompt-injection defense
// ----------------------------------------------------------------------------

// C0/C1 control chars except tab/newline/CR (those are normalized to spaces below).
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const ROLE_TAGS = /<\/?\s*(system|assistant|user|tool|human)\b[^>]*>/gi;

// Neutralizes a single untrusted string before it enters an LLM prompt.
// - strips control chars and role/chat-markup tags an injection uses for structure
// - replaces backticks (code fences) so the model can't be told "end of data" early
// - flattens newlines (untrusted values here are short labels/queries, never paragraphs)
// - caps length to bound token cost and truncation attacks
export function sanitizeForPrompt(input: unknown, maxLen = 200): string {
  let s = typeof input === "string" ? input : String(input ?? "");
  s = s.replace(CONTROL_CHARS, "");
  s = s.replace(ROLE_TAGS, " ");
  s = s.replace(/`+/g, "'");
  s = s.replace(/\r?\n|\r/g, " ");
  s = s.replace(/\s{2,}/g, " ").trim();
  if (s.length > maxLen) s = s.slice(0, maxLen).trimEnd() + "…";
  return s;
}

// Sanitizes a list of untrusted strings (caps both element length and list size).
export function sanitizeListForPrompt(items: unknown[] | undefined, maxLen = 120, maxItems = 40): string[] {
  return (items ?? [])
    .slice(0, maxItems)
    .map((i) => sanitizeForPrompt(i, maxLen))
    .filter(Boolean);
}

// ----------------------------------------------------------------------------
// 2) SSRF guard + response-size cap for third-party fetches
// ----------------------------------------------------------------------------

// IPv4 ranges that must never be fetched (private, loopback, link-local, CGNAT, "this host").
const BLOCKED_IPV4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(1[6-9]|2\d|3[0-1])\.)/;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "0.0.0.0",
  "::1",
  "169.254.169.254", // AWS/GCP/Azure instance metadata
  "metadata.google.internal",
  "metadata",
]);

// True only for URLs safe to fetch from the server: http(s), a public host, no odd ports.
export function isSafePublicUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false; // credentials in URL → reject

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host)) return false;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return false;
  if (BLOCKED_IPV4.test(host)) return false;
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return false; // IPv6 ULA/link-local
  if (host === "::") return false;

  // Only allow default/standard web ports (blocks probing internal services on odd ports).
  if (u.port && !["80", "443", "8080"].includes(u.port)) return false;
  return true;
}

export const MAX_RESPONSE_BYTES = 3_000_000; // 3 MB cap for crawled pages/feeds

// Reads a Response body as text but refuses bodies larger than maxBytes.
// Checks the declared Content-Length first, then enforces the cap while streaming.
export async function readTextCapped(res: Response, maxBytes = MAX_RESPONSE_BYTES): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`response too large (${declared} bytes)`);
  }
  if (!res.body) return (await res.text()).slice(0, maxBytes);

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`response exceeded ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(concat(chunks));
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

// ----------------------------------------------------------------------------
// 3) Tiny in-memory rate limiter (per-key, sliding minimum interval)
// ----------------------------------------------------------------------------

const lastHit = new Map<string, number>();

// Returns true if the action for `key` is allowed now (i.e. >= minIntervalMs since last).
// Best-effort only: per-instance memory, resets on cold start. Enough to stop button spam.
export function allowByInterval(key: string, minIntervalMs: number): boolean {
  const now = Date.now();
  const prev = lastHit.get(key) ?? 0;
  if (now - prev < minIntervalMs) return false;
  lastHit.set(key, now);
  return true;
}

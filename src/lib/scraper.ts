// Optional render + anti-bot proxy for sites that block direct crawling (Cloudflare 403)
// or render their content client-side (SPAs). Opt-in via env:
//
//   SCRAPER_API_KEY   — your key. Without it, this module is a no-op and the crawler
//                       keeps using direct fetches only (graceful degradation).
//   SCRAPER_PROVIDER  — "scrapingbee" (default) | "scraperapi".
//
// Both providers are drop-in: we build a wrapper URL that returns the target page's HTML
// (optionally JS-rendered), so the rest of the crawler treats it like a normal fetch.

import { fetchWithTimeout } from "./http";
import { readTextCapped, isSafePublicUrl } from "./security";

type Provider = "scrapingbee" | "scraperapi";

function provider(): Provider {
  return (process.env.SCRAPER_PROVIDER || "scrapingbee").toLowerCase() === "scraperapi"
    ? "scraperapi"
    : "scrapingbee";
}

export function scraperConfigured(): boolean {
  return Boolean(process.env.SCRAPER_API_KEY);
}

export function scraperName(): string {
  return provider();
}

// Builds the provider request URL that fetches `target` and returns its HTML.
// `render` toggles JS rendering (needed for SPAs; costs more credits).
function buildUrl(target: string, render: boolean): string {
  const key = process.env.SCRAPER_API_KEY as string;
  const enc = encodeURIComponent(target);
  if (provider() === "scraperapi") {
    return `https://api.scraperapi.com/?api_key=${key}&url=${enc}&render=${render ? "true" : "false"}`;
  }
  // scrapingbee: stealth/render params help get past Cloudflare bot checks.
  const renderParam = render ? "true" : "false";
  return `https://app.scrapingbee.com/api/v1/?api_key=${key}&url=${enc}&render_js=${renderParam}&block_resources=${render ? "false" : "true"}`;
}

// Fetches the target through the configured proxy and returns the (size-capped) body.
// Throws if the proxy isn't configured or the target URL isn't a safe public URL.
export async function scraperFetchText(
  target: string,
  opts: { render?: boolean; timeoutMs?: number } = {},
): Promise<string> {
  if (!scraperConfigured()) throw new Error("scraper not configured");
  if (!isSafePublicUrl(target)) throw new Error("unsafe target URL");
  const url = buildUrl(target, opts.render ?? true);
  const res = await fetchWithTimeout(url, {
    timeoutMs: opts.timeoutMs ?? 20_000, // rendered fetches are slower than direct
    headers: { Accept: "text/html,application/xhtml+xml,application/xml,*/*" },
  });
  return readTextCapped(res);
}

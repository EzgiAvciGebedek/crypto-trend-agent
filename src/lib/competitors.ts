// Competitor content crawler.
//
// For each competitor (src/config/competitors.ts) we try its candidate sources in order:
//  - RSS  → parsed with rss-parser (structured, dated).
//  - HTML → article links extracted heuristically from the page markup.
// The first source that yields items wins. Everything is timeout-protected and degrades
// gracefully: a failing site produces an empty card with an error note, never throws.
//
// Results are cached in-process for CACHE_TTL_MS so page renders stay fast and we don't
// hammer competitor sites on every request.

import Parser from "rss-parser";
import { COMPETITOR_SITES, type Competitor } from "@/config/competitors";
import { fetchWithTimeout } from "./http";
import { isSafePublicUrl, readTextCapped } from "./security";
import { scraperConfigured, scraperFetchText, scraperName } from "./scraper";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const PER_SOURCE_TIMEOUT_MS = 8_000;
const MAX_ITEMS_PER_COMPETITOR = 10;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const rss: Parser = new Parser({
  timeout: PER_SOURCE_TIMEOUT_MS,
  headers: { "User-Agent": BROWSER_UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
});

export interface CompetitorItem {
  title: string;
  url: string;
  isoDate: string | null;
}

export interface CompetitorResult {
  id: string;
  name: string;
  homepage: string;
  items: CompetitorItem[];
  keywords: Array<{ word: string; count: number }>;
  sourceUsed: string | null; // the URL that produced the items
  via?: string; // proxy provider name when the render/anti-bot proxy was used
  ok: boolean;
  error?: string;
}

// --- RSS source ---

function mapRssItems(items: Parser.Item[]): CompetitorItem[] {
  return (items ?? [])
    .map((it) => ({
      title: (it.title ?? "").trim(),
      url: (it.link ?? "").trim(),
      isoDate: it.isoDate ?? it.pubDate ?? null,
    }))
    .filter((it) => it.title && it.url);
}

async function fromRss(url: string): Promise<CompetitorItem[]> {
  return mapRssItems((await rss.parseURL(url)).items ?? []);
}

// Parse an already-fetched RSS/XML string (used for the proxy path).
async function fromRssText(xml: string): Promise<CompetitorItem[]> {
  return mapRssItems((await rss.parseString(xml)).items ?? []);
}

// --- HTML source (heuristic article-link extraction) ---

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

const CONTENT_PATH = /\/(blog|news|article|articles|learn|insights|press|academy|analysis|research|updates?)\//i;
const DATE_PATH = /\/20\d{2}\//;
const NAV_TEXT = /^(home|login|log in|sign ?up|sign in|register|about|about us|careers?|contact|support|help|cookies?|privacy|terms|download|pricing|products?|features?|company|blog|news|menu|search|next|previous|read more|learn more|more|all|view all|see all)$/i;

// Slug-looking last path segment (hyphenated, several words) → a title fallback.
function looksLikeArticleSlug(pathname: string): boolean {
  const seg = pathname.replace(/\/+$/, "").split("/").pop() ?? "";
  return seg.length > 15 && (seg.match(/-/g)?.length ?? 0) >= 2;
}

function titleFromSlug(pathname: string): string {
  const seg = pathname.replace(/\/+$/, "").split("/").pop() ?? "";
  return seg
    .replace(/\.(html?|php)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

async function fromHtml(pageUrl: string): Promise<CompetitorItem[]> {
  const res = await fetchWithTimeout(pageUrl, {
    timeoutMs: PER_SOURCE_TIMEOUT_MS,
    headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml" },
  });
  const html = await readTextCapped(res); // refuse oversized responses
  return extractHtmlLinks(html, pageUrl);
}

// Pure extractor: pull article-like links from already-fetched HTML.
function extractHtmlLinks(html: string, pageUrl: string): CompetitorItem[] {
  const base = new URL(pageUrl);

  const items: CompetitorItem[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    let text = stripTags(m[2]);
    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      continue;
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
    // same registrable site only (host endsWith base's root domain)
    const root = base.hostname.split(".").slice(-2).join(".");
    if (!abs.hostname.endsWith(root)) continue;

    const path = abs.pathname;
    // Qualify only real content sections (blog/news/dated). Arbitrary slug-like links are
    // NOT enough on their own — they pull in nav/footer junk (terms, fees, about…).
    const isContent = CONTENT_PATH.test(path) || DATE_PATH.test(path);
    if (!isContent) continue;

    if (!text || text.length < 20) {
      // anchor text too short → derive a readable title from the slug
      if (looksLikeArticleSlug(path)) text = titleFromSlug(path);
      else continue;
    }
    if (text.length > 180 || text.split(/\s+/).length < 3) continue;
    if (NAV_TEXT.test(text)) continue;

    const key = abs.href.replace(/[?#].*$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title: text, url: abs.href, isoDate: null });
    if (items.length >= MAX_ITEMS_PER_COMPETITOR) break;
  }
  return items;
}

// --- Keyword extraction from titles ---

const KW_STOP = new Set<string>([
  "the","a","an","of","to","in","on","for","and","or","is","are","with","at","by","from","as","this","that","new","will","has","have","its","was","be","not","how","what","why","your","you","our","we","it","best","top","guide","2024","2025","2026","crypto","cryptocurrency","bitcoin","btc",
  "de","het","een","van","op","met","voor","en","naar","om","dat","dit","nieuwe","hoe","wat","waarom",
  "der","die","das","und","im","auf","mit","für","ist","ein","eine","wie","was","warum",
  "le","la","les","des","un","une","et","pour","avec","sur","dans","est","comment","pourquoi",
  "el","los","las","del","para","con","por","cómo","qué",
  "di","per","su","che","come","cosa",
]);

function extractKeywords(titles: string[], ownName: string, limit = 8): Array<{ word: string; count: number }> {
  const own = ownName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const counts = new Map<string, number>();
  for (const t of titles) {
    const toks = t
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
    const seenInTitle = new Set<string>();
    for (const tok of toks) {
      if (tok.length < 3 || /^\d+$/.test(tok) || KW_STOP.has(tok)) continue;
      if (tok.replace(/[^a-z0-9]/g, "") === own) continue;
      if (seenInTitle.has(tok)) continue; // count once per title
      seenInTitle.add(tok);
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || b.word.length - a.word.length)
    .slice(0, limit);
}

// --- Per-competitor crawl ---

async function crawlOne(c: Competitor): Promise<CompetitorResult> {
  const finish = (items: CompetitorItem[], sourceUsed: string, via?: string): CompetitorResult => {
    const trimmed = items.slice(0, MAX_ITEMS_PER_COMPETITOR);
    return {
      id: c.id,
      name: c.name,
      homepage: c.homepage,
      items: trimmed,
      keywords: extractKeywords(trimmed.map((i) => i.title), c.name),
      sourceUsed,
      via,
      ok: true,
    };
  };

  let lastError = "no items found";
  for (const src of c.sources) {
    // SSRF guard: never fetch a non-public target, even if the config is edited.
    if (!isSafePublicUrl(src.url)) {
      lastError = "blocked non-public URL";
      continue;
    }
    // 1) Direct fetch (free, fast).
    try {
      const items = src.type === "rss" ? await fromRss(src.url) : await fromHtml(src.url);
      if (items.length > 0) return finish(items, src.url);
      // Succeeded but nothing extractable (e.g. a JS-rendered SPA with no server-side
      // article links) — record this, not just thrown errors, so the final message
      // reflects the LAST source actually tried, not a stale error from an earlier one.
      lastError = "no items found (page returned no extractable content)";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    // 2) Proxy fallback — renders JS / bypasses anti-bot (Cloudflare). Opt-in via env.
    // Also runs when the direct fetch returned 0 items (JS-rendered SPA).
    if (scraperConfigured()) {
      try {
        const text = await scraperFetchText(src.url, { render: src.type === "html" });
        const items = src.type === "rss" ? await fromRssText(text) : extractHtmlLinks(text, src.url);
        if (items.length > 0) return finish(items, src.url, scraperName());
        lastError = "proxy: no items found (page returned no extractable content)";
      } catch (err) {
        lastError = `proxy: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }
  return { id: c.id, name: c.name, homepage: c.homepage, items: [], keywords: [], sourceUsed: null, ok: false, error: lastError };
}

// --- Aggregate + cache ---

let cache: { at: number; data: CompetitorResult[] } | null = null;

// `forceFresh` bypasses the cache — used by the scheduled cron, which IS the authoritative
// daily refresh and shouldn't serve a stale in-process cache from a previous invocation.
export async function crawlAllCompetitors(forceFresh = false): Promise<CompetitorResult[]> {
  if (!forceFresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const data = await Promise.all(COMPETITOR_SITES.map((c) => crawlOne(c)));
  cache = { at: Date.now(), data };
  return data;
}

// Newest items across all competitors, tagged with the competitor name, capped at `limit`.
export interface AggregatedItem extends CompetitorItem {
  competitor: string;
  competitorId: string;
}

export function latestAcrossCompetitors(results: CompetitorResult[], limit = 15): AggregatedItem[] {
  const all: AggregatedItem[] = [];
  for (const r of results) {
    for (const it of r.items) all.push({ ...it, competitor: r.name, competitorId: r.id });
  }
  all.sort((a, b) => {
    const ta = a.isoDate ? new Date(a.isoDate).getTime() : 0;
    const tb = b.isoDate ? new Date(b.isoDate).getTime() : 0;
    return tb - ta; // newest first; undated (0) sink to the end
  });
  return all.slice(0, limit);
}

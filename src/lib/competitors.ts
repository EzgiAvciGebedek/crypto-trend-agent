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
import { COMPETITOR_SITES, type Competitor, type CompetitorSource } from "@/config/competitors";
import { fetchWithTimeout, sleep } from "./http";
import { isSafePublicUrl, readTextCapped } from "./security";
import { scraperConfigured, scraperFetchText, scraperName } from "./scraper";
import { renderPageHtml, closeBrowser } from "./headlessBrowser";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const PER_SOURCE_TIMEOUT_MS = 8_000;
const MAX_ITEMS_PER_SOURCE = 10; // cap on links pulled from a single page/feed
const MAX_ITEMS_PER_LANG = 6; // cap per language when merging, so one language can't crowd out the rest
const MAX_ITEMS_PER_COMPETITOR = 20; // cap on the final merged (all-languages) list
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Overall wall-clock budget for crawling ALL competitors, well under Vercel's 60s hard
// kill (maxDuration on /api/cron/competitors). Without this, a competitor whose sources
// all fall through to the headless-browser tier (shared 3-page semaphore, up to ~10s per
// page) can make the whole Promise.all run past 60s — and unlike our own timeout, Vercel's
// FUNCTION_INVOCATION_TIMEOUT kills the function BEFORE saveCompetitorContent ever runs,
// so a slow run doesn't just return late, it silently persists NOTHING for that day.
// Confirmed live: querying competitor_content's `date` column showed exactly one distinct
// date ever — today, and only after a manual trigger — meaning the scheduled cron had never
// once finished in time on its own since this table existed.
const CRAWL_BUDGET_MS = 45_000;

const rss: Parser = new Parser({
  timeout: PER_SOURCE_TIMEOUT_MS,
  headers: { "User-Agent": BROWSER_UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
});

export interface CompetitorItem {
  title: string;
  url: string;
  isoDate: string | null;
  lang?: string; // which market language this item came from (see config/competitors.ts)
}

export interface CompetitorResult {
  id: string;
  name: string;
  homepage: string;
  items: CompetitorItem[]; // merged across every language that returned content
  keywords: Array<{ word: string; count: number }>;
  sourceUsed: string | null; // the first successful source's URL
  via?: string; // proxy/render provider name when one was used for the primary source
  ok: boolean;
  error?: string;
  langs?: string[]; // languages that actually contributed items, e.g. ["en", "nl", "de"]
  timedOut?: boolean; // ran out of the shared crawl budget — caller should NOT persist this
  // over a previous good row (see /api/cron/competitors), since it's an artifact of this
  // run being slow, not evidence the competitor's content actually disappeared.
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

// Some sites flatten a "category" tag + title + publish date into one anchor's text with
// no separate <time> element to target — e.g. Revolut (English): "Financial basics Best
// places to visit in January 30 June 2026", or Bitvavo (German): "...Stille am Markt 10.
// Aug. 2026" / "...Charakter verändert 27. Juli 2026". Split a trailing date into a real
// isoDate instead of leaving it glued to the title — this both cleans the title AND lets
// the item rank correctly by actual date instead of sinking to the bottom as "undated".
// Covers every language configured in config/competitors.ts (en, nl, de, fr, es, it, pl,
// pt) plus common abbreviated forms (e.g. "Aug.") since some locales glue those on too.
const MONTH_NUM: Record<string, number> = (() => {
  const table: Record<number, string[]> = {
    1: ["january", "januar", "januari", "janvier", "enero", "gennaio", "styczeń", "stycznia", "janeiro", "jan"],
    2: ["february", "februar", "februari", "février", "fevrier", "febrero", "febbraio", "luty", "lutego", "fevereiro", "feb"],
    3: ["march", "märz", "marz", "mär", "maart", "mars", "marzo", "marzec", "marca", "março", "marco", "mar"],
    4: ["april", "avril", "abril", "aprile", "kwiecień", "kwietnia", "apr"],
    5: ["may", "mai", "mei", "mayo", "maggio", "maj", "maja", "maio"],
    6: ["june", "juni", "juin", "junio", "giugno", "czerwiec", "czerwca", "junho", "jun"],
    7: ["july", "juli", "juillet", "julio", "luglio", "lipiec", "lipca", "julho", "jul"],
    8: ["august", "augustus", "août", "aout", "agosto", "sierpień", "sierpnia", "aug"],
    9: ["september", "septembre", "septiembre", "settembre", "wrzesień", "września", "setembro", "sep", "sept"],
    10: ["october", "oktober", "octobre", "octubre", "ottobre", "październik", "października", "outubro", "oct", "okt"],
    11: ["november", "novembre", "noviembre", "listopad", "listopada", "novembro", "nov"],
    12: ["december", "dezember", "décembre", "decembre", "diciembre", "dicembre", "grudzień", "grudnia", "dezembro", "dec", "dez"],
  };
  const out: Record<string, number> = {};
  for (const [num, names] of Object.entries(table)) for (const n of names) out[n] = Number(num);
  return out;
})();
// Day, optional trailing period, month word (letters + optional diacritics, optional
// trailing period for abbreviations like "Aug."), 4-digit year.
const TRAILING_DATE_RE = /\s+(\d{1,2})\.?\s+(\p{L}+)\.?\s+(\d{4})$/u;

function splitTrailingDate(text: string): { title: string; isoDate: string | null } {
  const m = text.match(TRAILING_DATE_RE);
  if (!m) return { title: text, isoDate: null };
  const [full, day, monthWord, year] = m;
  const month = MONTH_NUM[monthWord.toLowerCase()];
  if (!month) return { title: text, isoDate: null };
  const parsed = new Date(Date.UTC(Number(year), month - 1, Number(day)));
  if (Number.isNaN(parsed.getTime())) return { title: text, isoDate: null };
  const title = text.slice(0, -full.length).trim();
  return { title: title.length >= 15 ? title : text, isoDate: parsed.toISOString() };
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
    const { title, isoDate } = splitTrailingDate(text);
    items.push({ title, url: abs.href, isoDate });
    if (items.length >= MAX_ITEMS_PER_SOURCE) break;
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

// --- Per-source and per-language crawl ---

interface SourceAttempt {
  items: CompetitorItem[];
  sourceUsed: string | null;
  via?: string;
  error?: string;
}

// Tries one candidate URL through the full fallback chain: direct fetch (free) → headless
// browser (free, fixes pure JS-rendered SPAs) → render/anti-bot proxy (paid, opt-in).
async function crawlSource(src: CompetitorSource): Promise<SourceAttempt> {
  // SSRF guard: never fetch a non-public target, even if the config is edited.
  if (!isSafePublicUrl(src.url)) return { items: [], sourceUsed: null, error: "blocked non-public URL" };

  let lastError = "no items found";
  // 1) Direct fetch (free, fast).
  try {
    const items = src.type === "rss" ? await fromRss(src.url) : await fromHtml(src.url);
    if (items.length > 0) return { items, sourceUsed: src.url };
    // Succeeded but nothing extractable (e.g. a JS-rendered SPA with no server-side
    // article links) — record this, not just thrown errors, so the final message
    // reflects the LAST thing actually tried, not a stale error from an earlier step.
    lastError = "no items found (page returned no extractable content)";
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
  // 2) Free headless-browser fallback — fixes pure client-rendered SPAs (no server-side
  // article links) by actually executing the page's JS. Only helps sites that aren't ALSO
  // actively bot-blocked (see headlessBrowser.ts) — HTML sources only, RSS needs no
  // rendering. Tried before the paid proxy since it costs nothing.
  if (src.type === "html") {
    try {
      const html = await renderPageHtml(src.url);
      const items = extractHtmlLinks(html, src.url);
      if (items.length > 0) return { items, sourceUsed: src.url, via: "headless-chromium" };
      lastError = "headless: no items found (page returned no extractable content)";
    } catch (err) {
      lastError = `headless: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  // 3) Proxy fallback — renders JS / bypasses anti-bot (Cloudflare). Opt-in via env.
  if (scraperConfigured()) {
    try {
      const text = await scraperFetchText(src.url, { render: src.type === "html" });
      const items = src.type === "rss" ? await fromRssText(text) : extractHtmlLinks(text, src.url);
      if (items.length > 0) return { items, sourceUsed: src.url, via: scraperName() };
      lastError = "proxy: no items found (page returned no extractable content)";
    } catch (err) {
      lastError = `proxy: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return { items: [], sourceUsed: null, error: lastError };
}

// Tries each candidate source for ONE language in order, stopping at the first success —
// mirrors the old single-language crawlOne, just scoped to one language's source list.
async function crawlLang(sources: CompetitorSource[]): Promise<SourceAttempt> {
  let lastError = "no items found";
  for (const src of sources) {
    const attempt = await crawlSource(src);
    if (attempt.items.length > 0) return attempt;
    if (attempt.error) lastError = attempt.error;
  }
  return { items: [], sourceUsed: null, error: lastError };
}

// --- Per-competitor crawl: every language runs independently and in parallel, then
// results are merged into one deduped, date-sorted list (capped per-language so one
// language with lots of items can't crowd the others out of the final trimmed list). ---

async function crawlOne(c: Competitor): Promise<CompetitorResult> {
  const byLang = new Map<string, CompetitorSource[]>();
  for (const src of c.sources) {
    const lang = src.lang ?? "en";
    const arr = byLang.get(lang) ?? [];
    arr.push(src);
    byLang.set(lang, arr);
  }
  const langEntries = [...byLang.entries()];
  // Stagger the start of each language's requests instead of firing them all in the same
  // tick — hitting one domain with N simultaneous requests to different locale paths looks
  // like a burst/scrape pattern to bot detection (observed live: eToro went from
  // succeeding reliably on a single request to failing on ALL 7 once they became
  // concurrent). Languages still run concurrently overall, just not launched in lockstep.
  const LANG_STAGGER_MS = 350;
  const attempts = await Promise.all(
    langEntries.map(([, sources], i) =>
      (i === 0 ? Promise.resolve() : sleep(i * LANG_STAGGER_MS)).then(() => crawlLang(sources)),
    ),
  );

  const seen = new Set<string>();
  const merged: CompetitorItem[] = [];
  const langsFound: string[] = [];
  let primarySource: string | null = null;
  let primaryVia: string | undefined;
  let lastError = "no items found";

  for (let i = 0; i < langEntries.length; i++) {
    const [lang] = langEntries[i];
    const attempt = attempts[i];
    if (attempt.items.length === 0) {
      if (attempt.error) lastError = attempt.error;
      continue;
    }
    langsFound.push(lang);
    if (!primarySource) {
      primarySource = attempt.sourceUsed;
      primaryVia = attempt.via;
    }
    for (const item of attempt.items.slice(0, MAX_ITEMS_PER_LANG)) {
      const key = item.url.replace(/[?#].*$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...item, lang });
    }
  }

  if (merged.length === 0) {
    return { id: c.id, name: c.name, homepage: c.homepage, items: [], keywords: [], sourceUsed: null, ok: false, error: lastError };
  }

  // Newest-first; undated items (most HTML-extracted ones) tie at 0 and keep their
  // language-iteration order (Array.sort is stable) rather than being shuffled.
  merged.sort((a, b) => {
    const ta = a.isoDate ? new Date(a.isoDate).getTime() : 0;
    const tb = b.isoDate ? new Date(b.isoDate).getTime() : 0;
    return tb - ta;
  });
  const trimmed = merged.slice(0, MAX_ITEMS_PER_COMPETITOR);

  return {
    id: c.id,
    name: c.name,
    homepage: c.homepage,
    items: trimmed,
    keywords: extractKeywords(trimmed.map((i) => i.title), c.name),
    sourceUsed: primarySource,
    via: primaryVia,
    ok: true,
    langs: langsFound,
  };
}

// --- Aggregate + cache ---

let cache: { at: number; data: CompetitorResult[] } | null = null;

// Races a promise against a deadline. On timeout we stop WAITING for `p` — the underlying
// fetch/render keeps running in the background until its own internal timeout fires, this
// just stops it from holding up the caller past the shared crawl budget.
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | "TIMED_OUT"> {
  return Promise.race([p, new Promise<"TIMED_OUT">((resolve) => setTimeout(() => resolve("TIMED_OUT"), ms))]);
}

// `forceFresh` bypasses the cache — used by the scheduled cron, which IS the authoritative
// daily refresh and shouldn't serve a stale in-process cache from a previous invocation.
export async function crawlAllCompetitors(forceFresh = false): Promise<CompetitorResult[]> {
  if (!forceFresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const deadline = Date.now() + CRAWL_BUDGET_MS;
  try {
    const data = await Promise.all(
      COMPETITOR_SITES.map(async (c) => {
        const remaining = Math.max(1_000, deadline - Date.now());
        const result = await withDeadline(crawlOne(c), remaining);
        if (result !== "TIMED_OUT") return result;
        return {
          id: c.id,
          name: c.name,
          homepage: c.homepage,
          items: [],
          keywords: [],
          sourceUsed: null,
          ok: false,
          error: "timed out (crawl budget exceeded)",
          timedOut: true,
        } satisfies CompetitorResult;
      }),
    );
    cache = { at: Date.now(), data };
    return data;
  } finally {
    // Close the shared headless browser (if any site needed it) so the serverless
    // invocation can wind down cleanly instead of leaving a Chromium process behind.
    await closeBrowser();
  }
}

// Newest items across all competitors, tagged with the competitor name, capped at `limit`.
export interface AggregatedItem extends CompetitorItem {
  competitor: string;
  competitorId: string;
}

// Fair round-robin across competitors, not a pure global date-sort. A pure date-sort lets
// the 1-2 competitors with parseable per-item dates (e.g. an RSS feed) crowd every slot,
// pushing out competitors whose markup never carries a date (bunq, Bybit, ...) even though
// they're responding with real, current content — confirmed live: with a plain date-sort,
// bunq (20 items, most of any competitor) never appeared in the top 15 at all. Instead,
// take each competitor's next-best item one round at a time so every responding site is
// guaranteed a slot; within a round, prefer items whose real date is known and newest.
export function latestAcrossCompetitors(results: CompetitorResult[], limit = 15): AggregatedItem[] {
  const perCompetitor: AggregatedItem[][] = results
    .filter((r) => r.items.length > 0)
    .map((r) => r.items.map((it) => ({ ...it, competitor: r.name, competitorId: r.id })));

  const out: AggregatedItem[] = [];
  for (let round = 0; out.length < limit && perCompetitor.some((arr) => arr.length > round); round++) {
    const picks = perCompetitor.map((arr) => arr[round]).filter((it): it is AggregatedItem => Boolean(it));
    picks.sort((a, b) => {
      const ta = a.isoDate ? new Date(a.isoDate).getTime() : 0;
      const tb = b.isoDate ? new Date(b.isoDate).getTime() : 0;
      return tb - ta; // dated items first (newest first) within the round; undated after
    });
    for (const it of picks) {
      if (out.length >= limit) break;
      out.push(it);
    }
  }
  return out;
}

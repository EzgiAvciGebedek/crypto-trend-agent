// Language-specific RSS news integration.
// - Browser-like User-Agent (some sources return 403 to bot UAs)
// - Each feed is timeout-protected with its own try/catch (one failing doesn't stop others)
// - Last-24h headlines, per-market coin mention counting

import Parser from "rss-parser";
import type { MarketCode } from "@/config/markets";
import { FEEDS } from "@/config/feeds";
import { CORE_COINS, type Coin } from "@/config/coins";
import type { SourceHealth } from "./types";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const parser: Parser = new Parser({
  timeout: 10_000,
  headers: {
    "User-Agent": BROWSER_UA,
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
});

export interface NewsItem {
  title: string;
  link: string;
  isoDate: string | null;
  source: string; // feed name
}

export interface MarketNews {
  market: MarketCode;
  items: NewsItem[]; // last 24 hours
  health: SourceHealth[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function withinLastDay(isoDate: string | null | undefined): boolean {
  if (!isoDate) return true; // include when no date (some feeds provide none)
  const t = new Date(isoDate).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t <= DAY_MS;
}

// Fetches all feeds for a single market; per-feed independent error handling.
export async function fetchMarketNews(market: MarketCode): Promise<MarketNews> {
  const feeds = FEEDS[market] ?? [];
  const items: NewsItem[] = [];
  const health: SourceHealth[] = [];

  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed.url);
      const fresh = (parsed.items ?? [])
        .filter((it) => withinLastDay(it.isoDate ?? it.pubDate))
        .map((it) => ({
          title: (it.title ?? "").trim(),
          link: it.link ?? "",
          isoDate: it.isoDate ?? it.pubDate ?? null,
          source: feed.name,
        }));
      items.push(...fresh);
      health.push({ source: `rss:${market}:${feed.name}`, ok: true, detail: `${fresh.length} fresh headlines` });
    } catch (err) {
      health.push({
        source: `rss:${market}:${feed.name}`,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { market, items, health };
}

// --- Mention counting ---

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary requirement for short/ambiguous aliases (which can clash with common words);
// a word boundary is applied to all aliases.
function buildMatcher(coin: Coin): RegExp {
  const terms = Array.from(new Set([coin.name.toLowerCase(), ...coin.aliases.map((a) => a.toLowerCase())]));
  const pattern = terms.map(escapeRe).join("|");
  return new RegExp(`(?:^|[^a-z0-9])(?:${pattern})(?:[^a-z0-9]|$)`, "i");
}

export interface MentionCount {
  topic: string; // coin name
  count: number;
}

// Mention count per coin in the given headline list (returns those with at least 1).
export function countMentions(items: NewsItem[], coins: Coin[] = CORE_COINS): MentionCount[] {
  const matchers = coins.map((c) => ({ name: c.name, re: buildMatcher(c) }));
  const counts = new Map<string, number>();

  for (const it of items) {
    const hay = ` ${it.title.toLowerCase()} `;
    for (const m of matchers) {
      if (m.re.test(hay)) counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
}

// --- Candidate keyword extraction from headlines ---
// Coin name + adjacent topic/event word combinations (e.g. "bitcoin etf", "solana koers").
// Language-agnostic: common function words (stopwords) of the 8 markets are filtered, coin goes first.

const STOPWORDS = new Set<string>([
  // EN
  "the","a","an","of","to","in","on","for","and","or","is","are","with","at","by","from","as","this","that","new","will","has","have","its","was","be","not",
  // NL
  "de","het","een","van","op","met","voor","en","naar","om","dat","dit","nieuwe","wordt","na","bij","over","tot","uit","zijn","dan","ook","aan","maar","kan","wel","toch","weer","nog","al","hoe","waarom","gaat","doen","deze","meer",
  // DE
  "der","die","das","und","im","auf","mit","für","ist","ein","eine","den","dem","zu","nach","bei","über","aus","wird","sich","auch","noch",
  // FR
  "le","la","les","du","des","un","une","et","au","aux","pour","avec","sur","dans","est","par","ce","cette","vers","son","sa","ses","plus",
  // ES
  "el","los","las","del","y","para","con","sobre","por","se","su","al","más","como","este","esta",
  // IT
  "lo","gli","di","per","su","è","che","si","nel","della","dei","con","una","dal",
  // PL
  "w","na","z","do","o","za","po","jest","się","nie","od","dla","oraz","już","czy",
  // PT
  "os","as","no","na","ao","uma","em","pela","pelo","mais","como",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function usableToken(t: string): boolean {
  if (t.length < 2) return false;
  if (/^\d+$/.test(t)) return false; // pure number
  return !STOPWORDS.has(t);
}

export interface NewsKeyword {
  keyword: string; // "bitcoin etf"
  count: number;
  coin: string; // associated coin name
}

// Builds 2-word combinations from meaningful words adjacent to coin aliases in headlines.
export function extractNewsKeywords(items: NewsItem[], coins: Coin[] = CORE_COINS, limit = 20): NewsKeyword[] {
  // alias -> coin name
  const aliasToCoin = new Map<string, string>();
  const aliasSet = new Set<string>();
  for (const c of coins) {
    for (const a of [c.name.toLowerCase(), ...c.aliases.map((x) => x.toLowerCase())]) {
      aliasToCoin.set(a, c.name);
      aliasSet.add(a);
    }
  }

  const counts = new Map<string, { count: number; coin: string }>();
  const bump = (kw: string, coin: string) => {
    const e = counts.get(kw) ?? { count: 0, coin };
    e.count += 1;
    counts.set(kw, e);
  };

  for (const it of items) {
    const toks = tokenize(it.title);
    for (let i = 0; i < toks.length; i++) {
      const alias = toks[i];
      if (!aliasSet.has(alias)) continue;
      const coin = aliasToCoin.get(alias)!;
      // adjacent words (next/prev), coin placed first → reads like a search query
      for (const other of [toks[i + 1], toks[i - 1]]) {
        if (!other || aliasSet.has(other) || !usableToken(other)) continue;
        bump(`${alias} ${other}`, coin);
      }
    }
  }

  return [...counts.entries()]
    .map(([keyword, v]) => ({ keyword, count: v.count, coin: v.coin }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// Today vs yesterday mention change (yesterday optional; if absent, change = count).
export function mentionChange(
  today: MentionCount[],
  yesterday: Record<string, number> = {},
): Array<MentionCount & { change: number }> {
  return today.map((m) => ({ ...m, change: m.count - (yesterday[m.topic] ?? 0) }));
}

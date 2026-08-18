// Competitor crawl targets. For each competitor we list candidate content sources in
// priority order — the crawler tries them top-to-bottom and stops at the first that
// yields items. RSS is preferred (structured, dated); HTML blog/news pages are a
// heuristic fallback (article links extracted from the markup). Many of these sites are
// JS-rendered SPAs, so a source may legitimately return nothing — the crawler degrades
// gracefully and the card shows "no items found".

export type SourceType = "rss" | "html";

export interface CompetitorSource {
  url: string;
  type: SourceType;
}

export interface Competitor {
  id: string;
  name: string;
  homepage: string;
  sources: CompetitorSource[];
}

export const COMPETITOR_SITES: Competitor[] = [
  {
    id: "bitvavo",
    name: "Bitvavo",
    homepage: "https://bitvavo.com",
    sources: [
      { url: "https://bitvavo.com/en/blog/feed", type: "rss" },
      { url: "https://bitvavo.com/en/blog", type: "html" },
    ],
  },
  {
    id: "binance",
    name: "Binance",
    homepage: "https://www.binance.com",
    sources: [
      { url: "https://www.binance.com/en/blog", type: "html" },
      { url: "https://www.binance.com/en/feed", type: "html" },
    ],
  },
  {
    id: "bybit",
    name: "Bybit",
    homepage: "https://www.bybit.com",
    sources: [
      { url: "https://blog.bybit.com/feed/", type: "rss" },
      { url: "https://blog.bybit.com/", type: "html" },
      { url: "https://learn.bybit.com/", type: "html" },
    ],
  },
  {
    id: "bunq",
    name: "bunq",
    homepage: "https://www.bunq.com",
    sources: [
      { url: "https://www.bunq.com/blog/feed", type: "rss" },
      { url: "https://www.bunq.com/blog", type: "html" },
      { url: "https://together.bunq.com/", type: "html" },
    ],
  },
  {
    id: "revolut",
    name: "Revolut",
    homepage: "https://www.revolut.com",
    sources: [
      { url: "https://blog.revolut.com/feed/", type: "rss" },
      { url: "https://www.revolut.com/news/", type: "html" },
      { url: "https://blog.revolut.com/", type: "html" },
    ],
  },
  {
    id: "trading212",
    name: "Trading 212",
    homepage: "https://www.trading212.com",
    sources: [
      { url: "https://www.trading212.com/blog/feed", type: "rss" },
      { url: "https://www.trading212.com/blog", type: "html" },
    ],
  },
  {
    id: "etoro",
    name: "eToro",
    homepage: "https://www.etoro.com",
    sources: [
      { url: "https://www.etoro.com/news-and-analysis/feed/", type: "rss" },
      { url: "https://www.etoro.com/news-and-analysis/", type: "html" },
    ],
  },
  {
    id: "blockchain-com",
    name: "Blockchain.com",
    homepage: "https://www.blockchain.com",
    // No RSS feed exists at this domain (verified live — /blog/feed is a 404, not a
    // guess gone stale). /blog itself is a Next.js SPA with no article links in the
    // server-rendered HTML, so this source needs the render proxy (SCRAPER_API_KEY) to
    // ever return content — same category as Binance/Bitvavo/Revolut/Trading212/Bybit.
    sources: [{ url: "https://www.blockchain.com/blog", type: "html" }],
  },
  {
    id: "kraken",
    name: "Kraken",
    homepage: "https://www.kraken.com",
    sources: [
      { url: "https://blog.kraken.com/feed", type: "rss" },
      { url: "https://blog.kraken.com/", type: "html" },
    ],
  },
  {
    id: "blox",
    name: "Blox",
    homepage: "https://blox.io",
    sources: [
      { url: "https://blox.io/blog/feed", type: "rss" },
      { url: "https://blox.io/en/blog", type: "html" },
      { url: "https://blox.io/blog", type: "html" },
    ],
  },
  {
    id: "capital-com",
    name: "Capital.com",
    homepage: "https://capital.com",
    sources: [
      { url: "https://capital.com/markets-news", type: "html" },
      { url: "https://capital.com/analysis", type: "html" },
    ],
  },
];

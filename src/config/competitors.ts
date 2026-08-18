// Competitor crawl targets. Sources are grouped by `lang` — for EACH language the
// competitor publishes in, candidate URLs are tried top-to-bottom and the crawler stops
// at the first that yields items for that language; results from every language are then
// merged into one combined list per competitor (see crawlOne in lib/competitors.ts).
// `lang` defaults to "en" when omitted. RSS is preferred (structured, dated); HTML blog/
// news pages are a heuristic fallback (article links extracted from the markup). Many of
// these sites are JS-rendered SPAs, so a source may legitimately return nothing — the
// crawler degrades gracefully and the card shows "no items found".
//
// Only languages verified live to have real, distinct localized content (not just a
// redirect to the English page) are listed — guessing locale URLs blindly for sites that
// don't actually localize their blog just adds noise, not coverage.

export type SourceType = "rss" | "html";

export interface CompetitorSource {
  url: string;
  type: SourceType;
  lang?: string; // ISO-ish market code (nl, de, fr, es, it, pl, pt) — defaults to "en"
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
    // /blog redirects to /news on every locale (verified live) — updated from the old
    // /blog path, which now 404s as an RSS guess but still 200s→redirects as HTML.
    sources: [
      { url: "https://bitvavo.com/en/blog/feed", type: "rss", lang: "en" },
      { url: "https://bitvavo.com/en/news", type: "html", lang: "en" },
      { url: "https://bitvavo.com/nl/news", type: "html", lang: "nl" },
      { url: "https://bitvavo.com/de/news", type: "html", lang: "de" },
      { url: "https://bitvavo.com/fr/news", type: "html", lang: "fr" },
      { url: "https://bitvavo.com/es/news", type: "html", lang: "es" },
      { url: "https://bitvavo.com/it/news", type: "html", lang: "it" },
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
      { url: "https://www.bunq.com/blog/feed", type: "rss", lang: "en" },
      { url: "https://www.bunq.com/blog", type: "html", lang: "en" },
      { url: "https://together.bunq.com/", type: "html", lang: "en" },
      { url: "https://www.bunq.com/nl/blog", type: "html", lang: "nl" },
      { url: "https://www.bunq.com/de/blog", type: "html", lang: "de" },
      { url: "https://www.bunq.com/fr/blog", type: "html", lang: "fr" },
      { url: "https://www.bunq.com/es/blog", type: "html", lang: "es" },
      { url: "https://www.bunq.com/it/blog", type: "html", lang: "it" },
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
      { url: "https://www.etoro.com/news-and-analysis/feed/", type: "rss", lang: "en" },
      { url: "https://www.etoro.com/news-and-analysis/", type: "html", lang: "en" },
      { url: "https://www.etoro.com/nl/news-and-analysis/", type: "html", lang: "nl" },
      { url: "https://www.etoro.com/de/news-and-analysis/", type: "html", lang: "de" },
      { url: "https://www.etoro.com/fr/news-and-analysis/", type: "html", lang: "fr" },
      { url: "https://www.etoro.com/es/news-and-analysis/", type: "html", lang: "es" },
      { url: "https://www.etoro.com/it/news-and-analysis/", type: "html", lang: "it" },
      { url: "https://www.etoro.com/pl/news-and-analysis/", type: "html", lang: "pl" },
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

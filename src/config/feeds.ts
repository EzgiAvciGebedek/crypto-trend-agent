// Per-market, language-specific crypto news RSS feeds.
// URLs can break; tested at initial setup (2026-08 live verification).
// You can easily add/remove feeds here. Health test: /api/health/feeds
//
// NOTE (2026-08 verification): Cointelegraph's localized feeds (de/fr/es/it/br)
// now return 410 Gone — they were discontinued and removed from the list. Working
// alternatives were added instead. BTC-ECHO and Portal do Bitcoin were removed because
// they return 403 even with a browser UA. All feeds are fetched with a browser-like
// User-Agent (see src/lib/rss.ts).

import type { MarketCode } from "./markets";

export interface Feed {
  url: string;
  name: string;
  note?: string; // warning/note shown in the dashboard (e.g. approximate signal)
}

export const FEEDS: Record<MarketCode, Feed[]> = {
  "EU-EN": [
    { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", name: "CoinDesk" },
    { url: "https://cointelegraph.com/rss", name: "Cointelegraph" },
    { url: "https://decrypt.co/feed", name: "Decrypt" },
  ],
  DE: [
    { url: "https://coin-update.de/feed/", name: "Coin-Update" },
    { url: "https://cryptomonday.de/feed/", name: "CryptoMonday" },
  ],
  FR: [
    { url: "https://cryptoast.fr/feed/", name: "Cryptoast" },
    { url: "https://journalducoin.com/feed/", name: "Journal du Coin" },
  ],
  ES: [
    { url: "https://news.bit2me.com/feed", name: "Bit2Me News" },
  ],
  IT: [
    { url: "https://cryptonomist.ch/feed/", name: "The Cryptonomist" },
    { url: "https://www.criptovaluta.it/feed", name: "Criptovaluta.it" },
    { url: "https://it.investing.com/rss/news_301.rss", name: "Investing.com IT (crypto)" },
  ],
  PT: [
    { url: "https://livecoins.com.br/feed/", name: "Livecoins", note: "Brazilian PT — approximate signal for the Portugal market" },
    { url: "https://portalcripto.com.br/feed/", name: "Portal Cripto", note: "Brazilian PT — approximate signal" },
  ],
  NL: [
    { url: "https://www.crypto-insiders.nl/feed/", name: "Crypto Insiders" },
    { url: "https://bitcoinmagazine.nl/feed", name: "Bitcoin Magazine NL" },
  ],
  PL: [
    { url: "https://comparic.pl/feed/", name: "Comparic" },
    { url: "https://bithub.pl/feed/", name: "Bithub" },
  ],
};

export function allFeeds(): Array<{ market: MarketCode; feed: Feed }> {
  const out: Array<{ market: MarketCode; feed: Feed }> = [];
  for (const mc of Object.keys(FEEDS) as MarketCode[]) {
    for (const feed of FEEDS[mc]) out.push({ market: mc, feed });
  }
  return out;
}

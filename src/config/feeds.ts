// Pazar bazlı, dil bazlı crypto haber RSS feed'leri.
// URL'ler bozulabilir; ilk kurulumda test edildi (2026-08 canlı doğrulama).
// Kullanıcı buradan kolayca feed ekleyip çıkarabilir. Sağlık testi: /api/health/feeds
//
// NOT (2026-08 doğrulaması): Cointelegraph'ın yerelleştirilmiş feed'leri (de/fr/es/it/br)
// artık 410 Gone dönüyor — kapatılmışlar, listeden çıkarıldı. Yerlerine çalışan alternatifler
// eklendi. BTC-ECHO ve Portal do Bitcoin tarayıcı UA'sıyla bile 403 verdiği için çıkarıldı.
// Tüm feed'ler tarayıcı benzeri User-Agent ile çekilir (bkz. src/lib/rss.ts).

import type { MarketCode } from "./markets";

export interface Feed {
  url: string;
  name: string;
  note?: string; // dashboard'da gösterilecek uyarı/not (ör. yaklaşık sinyal)
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
    { url: "https://livecoins.com.br/feed/", name: "Livecoins", note: "Brezilya PT — Portekiz pazarı için yaklaşık sinyal" },
    { url: "https://portalcripto.com.br/feed/", name: "Portal Cripto", note: "Brezilya PT — yaklaşık sinyal" },
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

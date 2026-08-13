// The 8 markets where ads run. trendsGeo = Google Trends country code ("" = global/mixed).
// Each market has its own language; ad copy and suggested keywords are produced in that language.

export type MarketCode = "NL" | "DE" | "FR" | "ES" | "IT" | "PL" | "PT" | "EU-EN";

export interface Market {
  code: MarketCode;
  country: string;
  language: string;
  trendsGeo: string; // Google Trends geo code; "" means global/mixed signal
  flag: string; // emoji flag for the dashboard
  // Language-specific keywords (like "price/rate") used to filter this market's
  // crypto-related daily trending searches.
  priceKeywords: string[];
  // Non-coin generic/platform Trends seeds (in that language) — for "search interest".
  // Competitor brand names are language-agnostic and added separately from config/themes.ts.
  genericSeeds: string[];
}

export const MARKETS: Market[] = [
  { code: "NL",    country: "Netherlands", language: "Dutch",      trendsGeo: "NL", flag: "🇳🇱", priceKeywords: ["koers", "crypto", "bitcoin", "prijs"], genericSeeds: ["crypto kopen", "crypto exchange", "beste crypto app"] },
  { code: "DE",    country: "Germany",     language: "German",     trendsGeo: "DE", flag: "🇩🇪", priceKeywords: ["kurs", "krypto", "bitcoin", "preis"], genericSeeds: ["krypto kaufen", "krypto börse", "beste krypto app"] },
  { code: "FR",    country: "France",      language: "French",     trendsGeo: "FR", flag: "🇫🇷", priceKeywords: ["cours", "crypto", "bitcoin", "prix"], genericSeeds: ["acheter crypto", "plateforme crypto", "meilleure application crypto"] },
  { code: "ES",    country: "Spain",       language: "Spanish",    trendsGeo: "ES", flag: "🇪🇸", priceKeywords: ["precio", "cripto", "bitcoin", "cotización"], genericSeeds: ["comprar criptomonedas", "exchange criptomonedas", "mejor app cripto"] },
  { code: "IT",    country: "Italy",       language: "Italian",    trendsGeo: "IT", flag: "🇮🇹", priceKeywords: ["prezzo", "cripto", "bitcoin", "quotazione"], genericSeeds: ["comprare criptovalute", "exchange criptovalute", "migliore app crypto"] },
  { code: "PL",    country: "Poland",      language: "Polish",     trendsGeo: "PL", flag: "🇵🇱", priceKeywords: ["cena", "krypto", "bitcoin", "kurs"], genericSeeds: ["kup kryptowaluty", "giełda kryptowalut", "najlepsza aplikacja krypto"] },
  { code: "PT",    country: "Portugal",    language: "Portuguese", trendsGeo: "PT", flag: "🇵🇹", priceKeywords: ["preço", "cripto", "bitcoin", "cotação"], genericSeeds: ["comprar criptomoedas", "corretora de criptomoedas", "melhor app cripto"] },
  { code: "EU-EN", country: "EU-wide",     language: "English",    trendsGeo: "",   flag: "🇪🇺", priceKeywords: ["price", "crypto", "bitcoin", "coin"], genericSeeds: ["buy crypto", "crypto exchange", "best crypto app"] },
];

export function getMarket(code: string): Market | undefined {
  return MARKETS.find((m) => m.code === code);
}

// Reklam verilen 8 pazar. trendsGeo = Google Trends ülke kodu ("" = global/karma).
// Her pazarın kendi dili var; reklam metinleri ve önerilen keyword'ler bu dilde üretilir.

export type MarketCode = "NL" | "DE" | "FR" | "ES" | "IT" | "PL" | "PT" | "EU-EN";

export interface Market {
  code: MarketCode;
  country: string;
  language: string;
  trendsGeo: string; // Google Trends geo kodu; "" ise global/karma sinyal
  flag: string; // dashboard için emoji bayrak
  // Bu pazarın dilinde "fiyat/kur" gibi crypto ile ilgili günlük trend filtresinde
  // kullanılacak dil bazlı anahtar kelimeler.
  priceKeywords: string[];
  // Coin-dışı jenerik/platform Trends seed'leri (o dilde) — "arama ilgisi" için.
  // Rakip marka adları dil-bağımsız olduğundan config/themes.ts'ten ayrıca eklenir.
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

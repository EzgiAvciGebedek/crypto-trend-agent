// Takip edilen coin listesi. Başlangıç: yaygın top coinler.
// Her gün CoinGecko trending'den gelen yeni coinler runtime'da bu listeye eklenir
// (bkz. cron akışı) — bu dosya statik "çekirdek" listedir.

export interface Coin {
  id: string; // CoinGecko id (ör. "bitcoin")
  symbol: string; // ör. "BTC"
  name: string; // ör. "Bitcoin"
  // Google Trends / RSS eşleştirmesinde aranacak takma adlar (küçük harf).
  aliases: string[];
}

export const CORE_COINS: Coin[] = [
  { id: "bitcoin",       symbol: "BTC",  name: "Bitcoin",      aliases: ["bitcoin", "btc"] },
  { id: "ethereum",      symbol: "ETH",  name: "Ethereum",     aliases: ["ethereum", "eth", "ether"] },
  { id: "tether",        symbol: "USDT", name: "Tether",       aliases: ["tether", "usdt"] },
  { id: "binancecoin",   symbol: "BNB",  name: "BNB",          aliases: ["bnb", "binance coin"] },
  { id: "solana",        symbol: "SOL",  name: "Solana",       aliases: ["solana", "sol"] },
  { id: "ripple",        symbol: "XRP",  name: "XRP",          aliases: ["xrp", "ripple"] },
  { id: "usd-coin",      symbol: "USDC", name: "USDC",         aliases: ["usdc", "usd coin"] },
  { id: "cardano",       symbol: "ADA",  name: "Cardano",      aliases: ["cardano", "ada"] },
  { id: "dogecoin",      symbol: "DOGE", name: "Dogecoin",     aliases: ["dogecoin", "doge"] },
  { id: "avalanche-2",   symbol: "AVAX", name: "Avalanche",    aliases: ["avalanche", "avax"] },
  { id: "tron",          symbol: "TRX",  name: "TRON",         aliases: ["tron", "trx"] },
  { id: "chainlink",     symbol: "LINK", name: "Chainlink",    aliases: ["chainlink", "link"] },
  { id: "polkadot",      symbol: "DOT",  name: "Polkadot",     aliases: ["polkadot", "dot"] },
  { id: "matic-network", symbol: "POL",  name: "Polygon",      aliases: ["polygon", "matic", "pol"] },
  { id: "litecoin",      symbol: "LTC",  name: "Litecoin",     aliases: ["litecoin", "ltc"] },
  { id: "shiba-inu",     symbol: "SHIB", name: "Shiba Inu",    aliases: ["shiba inu", "shib"] },
  { id: "uniswap",       symbol: "UNI",  name: "Uniswap",      aliases: ["uniswap", "uni"] },
  { id: "stellar",       symbol: "XLM",  name: "Stellar",      aliases: ["stellar", "xlm"] },
  { id: "cosmos",        symbol: "ATOM", name: "Cosmos",       aliases: ["cosmos", "atom"] },
  { id: "monero",        symbol: "XMR",  name: "Monero",       aliases: ["monero", "xmr"] },
  { id: "aave",          symbol: "AAVE", name: "Aave",         aliases: ["aave"] },
  { id: "arbitrum",      symbol: "ARB",  name: "Arbitrum",     aliases: ["arbitrum", "arb"] },
  { id: "optimism",      symbol: "OP",   name: "Optimism",     aliases: ["optimism"] },
  { id: "near",          symbol: "NEAR", name: "NEAR Protocol",aliases: ["near protocol", "near"] },
  { id: "pepe",          symbol: "PEPE", name: "Pepe",         aliases: ["pepe"] },
];

// Google Trends'in aynı istekte en fazla 5 terim karşılaştırabilmesi için
// coin listesini 5'li gruplara böler.
export function chunkCoins<T>(coins: T[], size = 5): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < coins.length; i += size) out.push(coins.slice(i, i + size));
  return out;
}

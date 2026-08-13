// Non-coin GENERIC / PLATFORM keyword themes and competitors.
// Because Finst is a crypto platform (exchange), these high-intent acquisition keywords
// matter as much as coin names and are not tied to a trend signal — they are "evergreen".
// Claude localizes them to each market's language; the English examples below are only guidance.

export interface GenericTheme {
  id: string;
  label: string; // English category name (used as recommendation topic in the dashboard)
  intent: string; // intent description (goes into the prompt)
  examples: string[]; // English example keywords (Claude localizes)
}

export const GENERIC_THEMES: GenericTheme[] = [
  {
    id: "account",
    label: "Account opening / signup",
    intent: "New user ready to open an account / sign up right now (highest conversion intent)",
    examples: ["open crypto account", "create crypto account", "sign up crypto exchange"],
  },
  {
    id: "platform",
    label: "Exchange / platform choice",
    intent: "User looking for the best/right crypto exchange or app",
    examples: ["best crypto exchange", "best crypto app", "crypto trading platform"],
  },
  {
    id: "competitor",
    label: "Competitor alternatives",
    intent: "User seeking an alternative to a competitor or comparing them (very high intent)",
    examples: ["binance alternative", "coinbase alternative", "<competitor> vs finst"],
  },
  {
    id: "how_to_buy",
    label: "How to buy crypto (generic)",
    intent: "New user wanting to learn/do buying crypto without naming a coin",
    examples: ["how to buy crypto", "buy crypto for beginners", "buy crypto with ideal/sepa"],
  },
  {
    id: "trust_safety",
    label: "Safety / trust",
    intent: "Cautious user looking for a safe, regulated, trustworthy platform",
    examples: ["safe crypto exchange", "regulated crypto exchange", "trusted crypto platform"],
  },
  {
    id: "fees",
    label: "Fees / cost",
    intent: "Price-sensitive user looking for low fees/commission",
    examples: ["low fee crypto exchange", "cheapest way to buy crypto"],
  },
  {
    id: "tax_regulation",
    label: "Tax / regulation",
    intent: "User researching crypto tax / legal status (indirect but valuable)",
    examples: ["crypto tax", "crypto regulation", "declare crypto taxes"],
  },
];

// Main European competitors. Some are market-specific (Claude picks the relevant ones per market).
export const COMPETITORS: string[] = [
  "Bitvavo",
  "Coinbase",
  "Binance",
  "Kraken",
  "Bitpanda",
  "eToro",
  "Revolut",
  "Trade Republic",
  "Young Platform",
  "Bit2Me",
  "Zonda",
  "Kriptomat",
];

// Claude analiz katmanı — pazar başına TEK istek (8 istek/gün toplam).
//
// Model seçimi: skill rehberi gereği varsayılan claude-opus-5; maliyet için düşürme kullanıcı
// kararıdır → ANTHROPIC_MODEL env ile değiştirilebilir (ör. claude-sonnet-5 / claude-haiku-4-5).
// Güvenilir JSON için structured outputs (output_config.format) + fence-strip parse yedeği.

import Anthropic from "@anthropic-ai/sdk";
import type { Market } from "@/config/markets";
import { GENERIC_THEMES, COMPETITORS } from "@/config/themes";
import type { Action, Confidence } from "./types";
import type { MarketDataPackage } from "./assemble";

// Boş string ("" — .env.local'de tanımlı ama değersiz) de varsayılana düşsün → `||` kullan.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const EFFORT = (process.env.ANTHROPIC_EFFORT || "low") as "low" | "medium" | "high";

export interface ClaudeRecommendation {
  topic: string;
  action: Action;
  confidence: Confidence;
  suggestedKeywords: string[];
  reasoning: string;
}

export interface MarketAnalysis {
  recommendations: ClaudeRecommendation[];
  marketSummary: string;
}

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client = new Anthropic();
  return client;
}

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          topic: { type: "string" },
          action: { type: "string", enum: ["invest", "watch", "reduce"] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          suggestedKeywords: { type: "array", items: { type: "string" } },
          reasoning: { type: "string" },
        },
        required: ["topic", "action", "confidence", "suggestedKeywords", "reasoning"],
      },
    },
    marketSummary: { type: "string" },
  },
  required: ["recommendations", "marketSummary"],
} as const;

function systemPrompt(market: Market): string {
  return [
    `You are the performance-marketing analyst responsible for the ${market.country} market of Finst, a European crypto platform.`,
    `You produce keyword investment recommendations for Google Ads search campaigns. The ads run in ${market.language}.`,
    ``,
    `OUTPUT LANGUAGE:`,
    `- marketSummary and every reasoning field: write in ENGLISH (the dashboard interface language).`,
    `- suggestedKeywords: write in ${market.language} (real search queries the user can paste straight into Google Ads).`,
    ``,
    `Rules:`,
    `- Base your recommendations ONLY on the signals given. If a signal is weak, set confidence=low but STILL provide keywords.`,
    `- Do NOT predict prices — this is an ad/keyword analysis.`,
    `- KEYWORD GENERATION (most important task): give AT LEAST 5, ideally 5-10, concrete search queries per recommendation.`,
    `  suggestedKeywords must be in ${market.language} — actual queries usable directly in Google Ads.`,
    `  Source priority: (1) "rising queries" data, (2) "candidate keywords extracted from news", (3) CoinGecko trending coin names.`,
    `  If there is NO Trends data, DERIVE keywords from the news candidate keywords and CoinGecko trending — never return a recommendation without keywords.`,
    `  Vary the intent: informational ("what is <coin>"), price ("<coin> price/koers/kurs"), purchase ("buy <coin>/<coin> kopen/kaufen").`,
    `- action: invest = raise budget/bid and add new keywords; watch = monitor; reduce = interest falling, pull back.`,
    `- Produce 3-7 recommendations. reasoning should be 2-3 sentences and state which signals it relies on.`,
    `- If sources failed/are missing, lower confidence (but keep providing keywords).`,
    ``,
    `GENERIC / PLATFORM KEYWORDS (VERY IMPORTANT): Finst is a crypto platform, so do not limit yourself to coin-name`,
    `keywords. AT LEAST 2-3 of your recommendations must be non-coin, high-intent acquisition themes. These themes are`,
    `not tied to a trend signal — they are "evergreen" acquisition keywords, always valuable; recommend them even`,
    `without a signal (with appropriate action + confidence). Categories and English examples (localize to ${market.language}):`,
    ...GENERIC_THEMES.map((t) => `  • ${t.label} — ${t.intent}. e.g. ${t.examples.join(", ")}`),
    `For competitor alternatives, use competitors known in the ${market.country} market (e.g. ${COMPETITORS.join(", ")}).`,
    `Competitor keyword examples: "<competitor> alternative/alternatief", "<competitor> vs finst", "better than <competitor>".`,
    `For a generic recommendation, use the category name as the topic (e.g. "Account opening / signup", "Competitor alternatives").`,
  ].join("\n");
}

function userPrompt(pkg: MarketDataPackage): string {
  return [
    `Today's data (${pkg.date}) — ${pkg.market.country} (${pkg.market.language}):`,
    ``,
    `## Google Trends`,
    pkg.trendsAvailable
      ? [
          `Interest scores (0-100) and window change:`,
          ...pkg.interest.map(
            (i) => `- ${i.coin}: score ${i.score ?? "?"}, change ${i.changePct?.toFixed(0) ?? "?"}%`,
          ),
          ``,
          `Rising queries (in the original language):`,
          ...Object.entries(pkg.rising).map(
            ([coin, qs]) => `- ${coin}: ${qs.map((q) => `${q.query} (${q.value})`).join(", ")}`,
          ),
          pkg.dailyCrypto.length ? `\nCrypto-related daily trending searches: ${pkg.dailyCrypto.join(", ")}` : ``,
        ].join("\n")
      : `⚠️ Google Trends data was NOT available for this market today. Analyze with RSS + CoinGecko + Reddit and lower confidence.`,
    ``,
    `## Local News Mentions (${pkg.market.language}, last 24h)`,
    pkg.newsMentions.length
      ? pkg.newsMentions.map((m) => `- ${m.topic}: ${m.count} mentions (vs yesterday ${m.change >= 0 ? "+" : ""}${m.change})`).join("\n")
      : `(no mentions found)`,
    ``,
    `## Candidate Keywords Extracted from News (from ${pkg.market.language} headlines)`,
    pkg.newsKeywords.length
      ? pkg.newsKeywords.map((k) => `- "${k.keyword}" (${k.coin}, ${k.count}x)`).join("\n")
      : `(no candidate keywords extracted from headlines)`,
    ``,
    `## Generic/Competitor Search Interest (Trends — non-coin terms)`,
    pkg.genericSignals.length
      ? pkg.genericSignals
          .map((g) => `- ${g.term}: score ${g.score ?? "?"}, change ${g.changePct === null ? "?" : g.changePct.toFixed(0) + "%"}${g.rising.length ? `, rising: ${g.rising.slice(0, 4).join(", ")}` : ""}`)
          .join("\n")
      : `(no Trends data for generic terms — still recommend generic keywords)`,
    ``,
    `## Global Context`,
    `CoinGecko trending: ${pkg.globalTrending.join(", ") || "none"}`,
    `Rising topics on Reddit (EU-EN social signal; usually spills into local markets within 1-2 days): ${pkg.redditTopics.join(", ") || "none"}`,
    ``,
    `## Source Health`,
    pkg.failedSources.length ? `Failed sources today: ${pkg.failedSources.join(", ")}` : `All sources healthy.`,
  ].join("\n");
}

function parseAnalysis(text: string): MarketAnalysis {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned) as MarketAnalysis;
  if (!Array.isArray(parsed.recommendations)) throw new Error("recommendations dizisi yok");
  return parsed;
}

// Tek pazar için Claude analizi. API yoksa null döner (çağıran graceful ele alır).
export async function analyzeMarket(pkg: MarketDataPackage): Promise<MarketAnalysis | null> {
  const c = getClient();
  if (!c) return null;

  const res = await c.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: systemPrompt(pkg.market),
    output_config: {
      effort: EFFORT,
      format: { type: "json_schema", schema: OUTPUT_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [{ role: "user", content: userPrompt(pkg) }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return parseAnalysis(text);
}

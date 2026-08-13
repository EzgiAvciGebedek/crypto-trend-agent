// Reddit — EU-EN pazarının sosyal sinyali.
//
// GERÇEK (2026-08 test): Reddit artık kimliksiz JSON erişimini (özellikle bulut IP'lerinden)
// 403 ile blokluyor — spec'in "key gerektirmez" varsayımı güncel değil. Bu yüzden:
//   - REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET varsa → app-only OAuth (userless) ile erişilir (ücretsiz).
//   - Yoksa public JSON denenir (Vercel'de büyük olasılıkla 403) → temiz degrade.
//   - Her durumda HTML/403 tespiti → boş sonuç + health fail, akış durmaz.
//
// Ücretsiz kimlik: https://www.reddit.com/prefs/apps → "script" veya "installed app" oluştur.

import { CORE_COINS, type Coin } from "@/config/coins";
import type { SourceHealth } from "./types";

const UA = "web:crypto-trend-agent:v1.0 (by /u/crypto-trend-agent)";

interface RedditPost {
  title: string;
  score: number;
  numComments: number;
  permalink: string;
  subreddit: string;
}

async function getAppToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { access_token?: string };
    return j.access_token ?? null;
  } catch {
    return null;
  }
}

async function fetchListing(path: string, token: string | null): Promise<RedditPost[] | null> {
  const host = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const headers: Record<string, string> = { "User-Agent": UA, Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${host}/${path}.json?limit=25`, { headers, cache: "no-store" });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !ct.includes("json")) return null; // 403/HTML → degrade
    const j = (await res.json()) as { data?: { children?: Array<{ data: Record<string, unknown> }> } };
    const children = j.data?.children ?? [];
    return children.map((c) => ({
      title: String(c.data.title ?? ""),
      score: Number(c.data.score ?? 0),
      numComments: Number(c.data.num_comments ?? 0),
      permalink: `https://www.reddit.com${String(c.data.permalink ?? "")}`,
      subreddit: String(c.data.subreddit ?? ""),
    }));
  } catch {
    return null;
  }
}

export interface RedditSignal {
  ok: boolean;
  hotPosts: RedditPost[];
  risingPosts: RedditPost[];
  // Yükselen konu bahsedilmeleri (coin adı -> post sayısı), sosyal momentum göstergesi.
  topicMentions: Array<{ topic: string; count: number }>;
  health: SourceHealth;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countTopics(posts: RedditPost[], coins: Coin[] = CORE_COINS): Array<{ topic: string; count: number }> {
  const counts = new Map<string, number>();
  const matchers = coins.map((c) => {
    const terms = Array.from(new Set([c.name.toLowerCase(), ...c.aliases.map((a) => a.toLowerCase())]));
    return { name: c.name, re: new RegExp(`(?:^|[^a-z0-9])(?:${terms.map(escapeRe).join("|")})(?:[^a-z0-9]|$)`, "i") };
  });
  for (const p of posts) {
    const hay = ` ${p.title.toLowerCase()} `;
    for (const m of matchers) if (m.re.test(hay)) counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count);
}

export async function getRedditSignal(): Promise<RedditSignal> {
  const token = await getAppToken();
  const hot = await fetchListing("r/CryptoCurrency/hot", token);
  const rising = await fetchListing("r/CryptoCurrency/rising", token);
  const markets = await fetchListing("r/CryptoMarkets/hot", token);

  const ok = hot !== null || rising !== null || markets !== null;
  const hotPosts = [...(hot ?? []), ...(markets ?? [])];
  const risingPosts = rising ?? [];

  return {
    ok,
    hotPosts,
    risingPosts,
    topicMentions: countTopics([...hotPosts, ...risingPosts]),
    health: {
      source: "reddit",
      ok,
      detail: ok
        ? `${hotPosts.length} hot + ${risingPosts.length} rising`
        : token
          ? "OAuth ile de erişilemedi"
          : "403 (REDDIT_CLIENT_ID/SECRET ile OAuth önerilir)",
    },
  };
}

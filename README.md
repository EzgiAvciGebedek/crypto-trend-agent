# Crypto Trend Agent

An agent for a crypto platform that advertises across specific markets (each in its own
language). Every day it collects crypto search trends from free sources and produces
**per-market, per-language Google Ads keyword investment recommendations**. The ad-group list is
not predefined — recommendations are generated from the trends by Claude. Recommendations cover
both coin-specific keywords and non-coin generic/platform themes (account opening, competitor
alternatives, fees, safety).

> Markets are defined in `src/config/markets.ts`; add or remove markets as needed. Each market has
> its own Trends geo, language, and language-specific generic seeds.

## Stack

- **Next.js 16** (App Router, TypeScript) · **Tailwind 4** · **Recharts**
- **Supabase** (Postgres) — history storage, day-over-day comparison
- **Anthropic Claude API** — per-market analysis (defaults to `claude-opus-5`)
- **Vercel** (Hobby) — hosting + daily cron

The interface is in English; analyst commentary (summary/reasoning) is in English, while ad
keywords are produced in each market's language (because ads run in that language).

## Data Sources

| Source | Used for | Note |
|---|---|---|
| **Google Trends** (`google-trends-api`) | interestOverTime + rising queries + dailyTrends | Unofficial, IP-based 429s → HTML/429 detection + backoff + **market rotation** |
| **CoinGecko** | global trending + price/volume (EUR) | Free; coins that enter trending are added to that day's Trends list |
| **Language-specific RSS** | per-market local news mentions + candidate keyword extraction | Each market's own-language sources (`src/config/feeds.ts`); dead feeds are tested and skipped |
| **Reddit** | English social signal | Unauthenticated JSON now returns 403 → OAuth (optional env) or clean degrade |

### Important source notes
- **Google Trends is fragile**: a single market can take ~60s+, and the Vercel Hobby limit is 60s.
  So Trends is collected for only **a few markets** each day and the starting index rotates day to
  day. All other sources run for every market every day. If Trends fails entirely, the analysis
  continues with RSS+CoinGecko+Reddit and the dashboard shows a warning.
- **Reddit** returns 403 from cloud IPs → set `REDDIT_CLIENT_ID/SECRET` (free) to make it work;
  otherwise the social signal is skipped and confidence is lowered.
- **Markets without a local feed** can use near-language sources as an approximate signal (noted in
  the feed config).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

### 1. Supabase
1. Create a free project at supabase.com.
2. **SQL Editor** → run the contents of `supabase/schema.sql`.
3. From Project Settings → API, add `SUPABASE_URL` and the `service_role` key to `.env.local`.

### 2. Anthropic
Add `ANTHROPIC_API_KEY`. Optional: `ANTHROPIC_MODEL` (defaults to `claude-opus-5`; for cost use
`claude-sonnet-5` / `claude-haiku-4-5`) and `ANTHROPIC_EFFORT` (`low`/`medium`/`high`).

### 3. Reddit (optional)
reddit.com/prefs/apps → "script" app → `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`.

### 4. CRON_SECRET
A random string. Protects the Vercel cron calls.

## Run / Test

- Dashboard: `npm run dev` → http://localhost:3000
- Manual analysis: the **"Run analysis now"** button on the home page (same-origin POST).
- Refresh a single market: `POST /api/cron/daily?market=<CODE>` (optionally `&trends=0` to skip Trends).
- Source health tests:
  - `GET /api/health/feeds` — tests all RSS feeds
  - `GET /api/health/trends?geo=<CODE>` — single-market Trends resilience test
  - `GET /api/analyze/test?geo=<CODE>&trends=0` — end-to-end single market (fast, no Trends)

## Deploy (Vercel)

1. Push the repo to GitHub and import it into Vercel.
2. Environment Variables: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `CRON_SECRET` (+ optional `REDDIT_*`, `ANTHROPIC_MODEL`, `COINGECKO_API_KEY`).
3. `vercel.json` defines one cron per day (`0 6 * * *`). If `CRON_SECRET` is set, Vercel
   automatically adds `Authorization: Bearer $CRON_SECRET` to the cron request → `/api/cron/daily`
   verifies it.

> On the Hobby plan the function timeout is 60s and there is a 1-cron-per-day limit; the
> architecture was built around this (time budget + market rotation). For full daily Trends across
> every market, use Vercel Pro (300s) or a separate worker (GitHub Actions/VPS).

## Structure

```
src/
  config/    markets.ts · coins.ts · feeds.ts · themes.ts   (market/coin/feed/generic-theme definitions)
  lib/       coingecko · rss · gtrends · reddit · claude · assemble · store · cron
  app/       dashboard (/, /market/[code], /compare, /history)
             api/cron/daily · api/health/* · api/analyze/test
supabase/schema.sql
```

## Cron Flow (`runDaily`)

1. CoinGecko trending + markets → global signals; new trending coins are added to the list.
2. Reddit → English social signal.
3. Markets are processed in rotated order within a time budget: RSS mentions + candidate keyword
   extraction + (if in rotation) Trends → market_metrics + snapshots are written.
4. Per-market Claude analysis (yesterday + today comparison; coin + generic/platform themes) →
   recommendations + market_summaries.
5. Source health is written to source_health; the dashboard shows it.

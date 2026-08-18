-- Crypto Trend Agent — Supabase schema
-- Run once in the Supabase SQL Editor.

-- Raw daily snapshots (per source / market)
create table if not exists daily_snapshots (
  id          bigint generated always as identity primary key,
  date        date not null,
  market_code text not null,            -- 'NL'..'EU-EN' or 'GLOBAL'
  source      text not null,            -- gtrends_interest | gtrends_rising | gtrends_daily | coingecko | rss | reddit
  raw_data    jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_snapshots_date_market on daily_snapshots (date, market_code);

-- Derived metrics per market, per coin/topic
create table if not exists market_metrics (
  id                    bigint generated always as identity primary key,
  date                  date not null,
  market_code           text not null,
  coin_or_topic         text not null,
  interest_score        numeric,        -- Trends 0-100 (nullable)
  interest_change_pct   numeric,
  news_mentions         integer not null default 0,
  news_mentions_change  integer not null default 0,
  rising_queries        jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now(),
  unique (date, market_code, coin_or_topic)
);
create index if not exists idx_metrics_date_market on market_metrics (date, market_code);
create index if not exists idx_metrics_topic on market_metrics (coin_or_topic);

-- Keyword investment recommendations produced by Claude
create table if not exists recommendations (
  id                  bigint generated always as identity primary key,
  date                date not null,
  market_code         text not null,
  topic               text not null,
  action              text not null,   -- invest | watch | reduce
  confidence          text not null,   -- low | medium | high
  suggested_keywords  jsonb not null default '[]'::jsonb,
  reasoning           text,
  created_at          timestamptz not null default now()
);
create index if not exists idx_recs_date_market on recommendations (date, market_code);

-- General Claude commentary per market
create table if not exists market_summaries (
  id           bigint generated always as identity primary key,
  date         date not null,
  market_code  text not null,
  summary      text,
  created_at   timestamptz not null default now(),
  unique (date, market_code)
);
create index if not exists idx_summaries_date on market_summaries (date);

-- Overall crypto search interest per market (localized "crypto" term) + 1d/7d/30d change
create table if not exists crypto_overall (
  id            bigint generated always as identity primary key,
  date          date not null,
  market_code   text not null,
  score         numeric,          -- most recent Trends interest (0-100)
  change_1d     numeric,
  change_7d     numeric,
  change_30d    numeric,
  created_at    timestamptz not null default now(),
  unique (date, market_code)
);
create index if not exists idx_overall_market_date on crypto_overall (market_code, date desc);

-- Source health for each run (for the dashboard indicator)
create table if not exists source_health (
  id          bigint generated always as identity primary key,
  date        date not null,
  source      text not null,           -- 'gtrends:NL', 'rss:DE:BTC-ECHO', 'coingecko', ...
  ok          boolean not null,
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_health_date on source_health (date);

-- Competitor Radar: persisted daily crawl results (2026-08-19 — was live-crawl-only with a
-- 30-min in-process cache, which doesn't actually stay warm across separate serverless
-- instances, so results weren't reliably "daily" for users. Now populated by a scheduled
-- cron, same pattern as the rest of this schema.)
create table if not exists competitor_content (
  id             bigint generated always as identity primary key,
  date           date not null,
  competitor_id  text not null,          -- 'bitvavo', 'kraken', ... (see src/config/competitors.ts)
  competitor     text not null,          -- display name
  homepage       text not null,
  items          jsonb not null default '[]'::jsonb,  -- [{title, url, isoDate}]
  keywords       jsonb not null default '[]'::jsonb,  -- [{word, count}]
  source_used    text,                   -- URL that produced the items
  via            text,                   -- render/anti-bot proxy provider name, if used
  ok             boolean not null default false,
  error          text,
  created_at     timestamptz not null default now(),
  unique (date, competitor_id)
);
create index if not exists idx_competitor_content_date on competitor_content (date);

-- Crypto Trend Agent — Supabase şeması
-- Supabase SQL Editor'de bir kez çalıştır.

-- Ham günlük anlık görüntüler (her kaynak / pazar için)
create table if not exists daily_snapshots (
  id          bigint generated always as identity primary key,
  date        date not null,
  market_code text not null,            -- 'NL'..'EU-EN' veya 'GLOBAL'
  source      text not null,            -- gtrends_interest | gtrends_rising | gtrends_daily | coingecko | rss | reddit
  raw_data    jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_snapshots_date_market on daily_snapshots (date, market_code);

-- Pazar başına, coin/konu başına türetilmiş metrikler
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

-- Claude'un ürettiği keyword yatırım önerileri
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

-- Pazar başına genel Claude yorumu
create table if not exists market_summaries (
  id           bigint generated always as identity primary key,
  date         date not null,
  market_code  text not null,
  summary      text,
  created_at   timestamptz not null default now(),
  unique (date, market_code)
);
create index if not exists idx_summaries_date on market_summaries (date);

-- Her çalıştırmadaki kaynak sağlığı (dashboard göstergesi için)
create table if not exists source_health (
  id          bigint generated always as identity primary key,
  date        date not null,
  source      text not null,           -- 'gtrends:NL', 'rss:DE:BTC-ECHO', 'coingecko', ...
  ok          boolean not null,
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_health_date on source_health (date);

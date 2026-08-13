# Finst Crypto Trend Agent

Finst'in 8 pazarında (NL, DE, FR, ES, IT, PL, PT, EU-EN) her gün ücretsiz kaynaklardan
crypto arama trendi toplayıp **pazar ve dil bazlı Google Ads keyword yatırım önerileri** üreten
bir agent. Ad group listesi önceden tanımlı değildir — öneriler trendlerden Claude tarafından üretilir.

## Teknoloji

- **Next.js 16** (App Router, TypeScript) · **Tailwind 4** · **Recharts**
- **Supabase** (Postgres) — geçmiş saklama, gün-gün karşılaştırma
- **Anthropic Claude API** — pazar başına analiz (varsayılan `claude-opus-5`)
- **Vercel** (Hobby) — barındırma + günlük cron

## Veri Kaynakları

| Kaynak | Ne için | Not |
|---|---|---|
| **Google Trends** (`google-trends-api`) | interestOverTime + rising queries + dailyTrends | Resmi değil, IP bazlı 429 verir → HTML/429 tespiti + backoff + **pazar rotasyonu** |
| **CoinGecko** | global trending + fiyat/hacim (EUR) | Ücretsiz; trending'e giren coinler o günün Trends listesine eklenir |
| **Dil bazlı RSS** | pazar başına yerel haber bahsedilmeleri | 2026-08 doğrulandı; ölen Cointelegraph feed'leri değiştirildi (bkz. `src/config/feeds.ts`) |
| **Reddit** | EU-EN sosyal sinyali | Kimliksiz JSON artık **403** → OAuth (opsiyonel env) veya temiz degrade |

### Önemli kaynak notları
- **Google Trends kırılgan**: tek pazar ~60sn+ sürebiliyor, Vercel Hobby limiti 60sn. Bu yüzden Trends
  her gün sadece **birkaç pazar** için toplanır ve başlangıç günden güne döndürülür (rotasyon). Diğer
  tüm kaynaklar her pazar için her gün çalışır. Trends tamamen başarısız olursa analiz RSS+CoinGecko+Reddit
  ile sürer ve dashboard'da uyarı gösterilir.
- **Reddit** bulut IP'lerinden 403 verir → çalışması için `REDDIT_CLIENT_ID/SECRET` (ücretsiz) önerilir;
  yoksa EU-EN sosyal sinyali atlanır, confidence düşürülür.
- **PT (Portekiz)**: yerel feed bulunamadığından Brezilya PT feed'leri yaklaşık sinyal olarak kullanılır.

## Kurulum

```bash
npm install
cp .env.example .env.local   # değerleri doldur
npm run dev
```

### 1. Supabase
1. supabase.com'da ücretsiz proje aç.
2. **SQL Editor** → `supabase/schema.sql` içeriğini çalıştır.
3. Project Settings → API'den `SUPABASE_URL` ve `service_role` anahtarını `.env.local`'e ekle.

### 2. Anthropic
`ANTHROPIC_API_KEY` ekle. İsteğe bağlı: `ANTHROPIC_MODEL` (varsayılan `claude-opus-5`; maliyet için
`claude-sonnet-5` / `claude-haiku-4-5`) ve `ANTHROPIC_EFFORT` (`low`/`medium`/`high`).

### 3. Reddit (opsiyonel)
reddit.com/prefs/apps → "script" app → `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`.

### 4. CRON_SECRET
Rastgele bir dize. Vercel cron çağrılarını korur.

## Çalıştırma / Test

- Dashboard: `npm run dev` → http://localhost:3000
- Manuel analiz: ana sayfadaki **"Analizi şimdi çalıştır"** butonu (aynı origin POST).
- Kaynak sağlık testleri:
  - `GET /api/health/feeds` — tüm RSS feed'lerini test eder
  - `GET /api/health/trends?geo=NL` — tek pazar Trends dayanıklılık testi
  - `GET /api/analyze/test?geo=NL&trends=0` — uçtan uca tek pazar (Trends'siz hızlı)

## Deploy (Vercel)

1. Repo'yu GitHub'a push et, Vercel'e import et.
2. Environment Variables: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `CRON_SECRET` (+ opsiyonel `REDDIT_*`, `ANTHROPIC_MODEL`, `COINGECKO_API_KEY`).
3. `vercel.json` günde 1 cron tanımlar (`0 6 * * *`). Vercel, `CRON_SECRET` env'i ayarlıysa cron
   isteğine otomatik `Authorization: Bearer $CRON_SECRET` ekler → `/api/cron/daily` bunu doğrular.

> Hobby planında fonksiyon süresi 60sn ve günde 1 cron sınırı vardır; mimari buna göre kuruldu
> (zaman bütçesi + pazar rotasyonu). Her pazarın her gün tam Trends'i için Vercel Pro (300sn) veya
> ayrı bir worker (GitHub Actions/VPS) gerekir.

## Yapı

```
src/
  config/    markets.ts · coins.ts · feeds.ts   (pazar/coin/feed tanımları)
  lib/       coingecko · rss · gtrends · reddit · claude · assemble · store · cron
  app/       dashboard (/, /market/[code], /compare, /history)
             api/cron/daily · api/health/* · api/analyze/test
supabase/schema.sql
```

## Cron Akışı (`runDaily`)

1. CoinGecko trending + markets → global sinyaller; yeni trending coinler listeye eklenir.
2. Reddit → EU-EN sosyal sinyali.
3. Pazarlar rotasyonlu sırayla, zaman bütçesiyle işlenir: RSS bahsedilme + (rotasyondaysa) Trends
   → market_metrics + snapshots yazılır.
4. Pazar başına Claude analizi (dün + bugün karşılaştırmalı) → recommendations + market_summaries.
5. Kaynak sağlığı source_health'e yazılır; dashboard gösterir.

// Minimal tip bildirimi — google-trends-api resmi tip getirmiyor.
// Tüm metodlar opts alır ve JSON string (ya da hata durumunda HTML string) döndürür.
declare module "google-trends-api" {
  type TrendsFn = (opts: Record<string, unknown>) => Promise<string>;
  interface GoogleTrends {
    interestOverTime: TrendsFn;
    interestByRegion: TrendsFn;
    relatedQueries: TrendsFn;
    relatedTopics: TrendsFn;
    dailyTrends: TrendsFn;
    realTimeTrends: TrendsFn;
    autoComplete: TrendsFn;
    default?: GoogleTrends;
  }
  const googleTrends: GoogleTrends;
  export default googleTrends;
}

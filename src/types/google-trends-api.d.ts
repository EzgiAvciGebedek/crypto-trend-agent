// Minimal type declaration — google-trends-api ships no official types.
// Every method takes opts and returns a JSON string (or an HTML string on error).
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

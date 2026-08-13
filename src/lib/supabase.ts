import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase istemcisi (service role key). Sadece server ortamında kullanılır.
// Env eksikse null döner; çağıran taraf bunu graceful biçimde ele alır (Faz 1'de DB opsiyonel).

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

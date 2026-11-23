let clientPromise;

export function isSupabaseConfigured() {
  const config = window.BARBER_SUPABASE_CONFIG;
  return Boolean(config?.url && config?.publishableKey);
}

export async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!clientPromise) {
    clientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm")
      .then(({ createClient }) => {
        const { url, publishableKey } = window.BARBER_SUPABASE_CONFIG;
        return createClient(url, publishableKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
      });
  }
  return clientPromise;
}

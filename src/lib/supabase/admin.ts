import "server-only";
import { createClient } from "@supabase/supabase-js";

// Supabase client with the service role key. It skips row-level security, so
// use it only on the server, only after checking who is signed in, and always
// filter by that user's id.
export function createAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase server keys are missing. Check SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

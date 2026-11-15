// Supabase settings come from Vercel's Supabase integration, which adds these
// environment variables to the project. Nothing secret is read here: the URL
// and the publishable (anon) key are meant to be public, and row-level
// security in the database decides what each signed-in user can see.
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
        "Run `vercel env pull .env.local` for local development.",
    );
  }
  return { url, key };
}

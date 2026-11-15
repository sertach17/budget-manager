import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Returns the signed-in user's id, or sends them to sign in. Anything that
// touches bank data needs a session that passed two-factor (aal2).
export async function requireTwoFactorUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  if (data.claims.aal !== "aal2") redirect("/mfa");
  return { userId: data.claims.sub as string, supabase };
}

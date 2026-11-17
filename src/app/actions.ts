"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Signs out this browser only. Supabase's default signs out everywhere, and
// that also ends every AI agent's sign-in, so each agent would have to be
// connected again. Agents are disconnected one by one on Connected agents.
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

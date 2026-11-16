"use server";

import { redirect } from "next/navigation";
import { requireTwoFactorUser } from "@/lib/auth";

const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{1,100}$/;

export type ConsentResult = { ok: false; message: string };

// Approving or turning down an AI agent. Both need a two-factor session; then
// Supabase sends you back to the agent with its answer.
async function decide(authorizationId: string, approve: boolean): Promise<ConsentResult> {
  const { supabase } = await requireTwoFactorUser();
  if (!AUTHORIZATION_ID.test(String(authorizationId))) return { ok: false, message: "This request isn't valid." };
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) {
    if (error) console.error("Agent consent failed:", error.message);
    return { ok: false, message: "This request expired. Start the connection again from your AI agent." };
  }
  redirect(data.redirect_url);
}

export async function approveAgent(authorizationId: string) {
  return decide(authorizationId, true);
}

export async function denyAgent(authorizationId: string) {
  return decide(authorizationId, false);
}

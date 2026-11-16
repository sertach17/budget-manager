"use server";

import { redirect } from "next/navigation";
import { requireTwoFactorUser } from "@/lib/auth";

const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{1,100}$/;

export type ConsentResult = { ok: false; message: string } | { ok: true };

const EXPIRED = "This request expired. Start the connection again from your AI agent.";

type Supabase = Awaited<ReturnType<typeof requireTwoFactorUser>>["supabase"];

// Records that you allowed this agent just now with two-factor. Supabase signs
// agents in without the two-factor mark, so the app only lets an agent in
// when its sign-in started right after one of these.
async function recordApproval(supabase: Supabase, authorizationId: string) {
  const { error } = await supabase.rpc("approve_agent_request", { p_authorization_id: authorizationId });
  if (error) console.error("Recording an agent approval failed:", error.message);
  return !error;
}

// Approving or turning down an AI agent. Both need a two-factor session; then
// Supabase sends you back to the agent with its answer.
async function decide(authorizationId: string, approve: boolean): Promise<ConsentResult> {
  const { supabase } = await requireTwoFactorUser();
  if (!AUTHORIZATION_ID.test(String(authorizationId))) return { ok: false, message: "This request isn't valid." };
  if (approve && !(await recordApproval(supabase, authorizationId))) return { ok: false, message: EXPIRED };
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) {
    if (error) console.error("Agent consent failed:", error.message);
    return { ok: false, message: EXPIRED };
  }
  redirect(data.redirect_url);
}

export async function approveAgent(authorizationId: string) {
  return decide(authorizationId, true);
}

export async function denyAgent(authorizationId: string) {
  return decide(authorizationId, false);
}

// An agent you allowed before is connecting again. Supabase has already said
// yes and handed the page the way back, but the agent gets in only once you
// allow it here with two-factor; then the page sends you back to it.
export async function allowAgain(authorizationId: string): Promise<ConsentResult> {
  const { supabase } = await requireTwoFactorUser();
  if (!AUTHORIZATION_ID.test(String(authorizationId))) return { ok: false, message: "This request isn't valid." };
  if (!(await recordApproval(supabase, authorizationId))) return { ok: false, message: EXPIRED };
  return { ok: true };
}

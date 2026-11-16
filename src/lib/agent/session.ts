import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { supabaseEnv } from "@/lib/supabase/env";

// An AI agent you connected signs in through Supabase's OAuth server and
// sends its access token with every request. These helpers check that token
// and give back a database client that acts as you, so row-level security
// limits the agent to your rows and to what agents are allowed to do.

export type AgentSession = {
  supabase: SupabaseClient;
  userId: string;
  clientId: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Checks an agent's bearer token. Only tokens from an agent you approved
// carry a client_id; your own browser session is turned away here.
export async function verifyAgentToken(token: string | undefined): Promise<AuthInfo | undefined> {
  if (!token || token.length > 4096) return undefined;
  const { url, key } = supabaseEnv();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.getClaims(token);
  const claims = data?.claims as Record<string, unknown> | undefined;
  if (error || !claims) return undefined;
  const clientId = claims.client_id;
  const userId = claims.sub;
  if (claims.role !== "authenticated" || typeof clientId !== "string" || !clientId) return undefined;
  if (typeof userId !== "string" || !UUID.test(userId)) return undefined;
  // Asks Supabase whether the sign-in is still alive, so an agent you
  // disconnected stops at once rather than when its token runs out.
  const { data: live, error: gone } = await supabase.auth.getUser(token);
  if (gone || live.user?.id !== userId) return undefined;
  // Supabase signs agents in without the two-factor mark, so the agent's
  // sign-in must have started right after you pressed Allow with two-factor.
  const asAgent = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: approved, error: notApproved } = await asAgent.rpc("agent_approved");
  if (notApproved || approved !== true) {
    if (notApproved) console.error("Checking an agent's approval failed:", notApproved.message);
    return undefined;
  }
  return {
    token,
    clientId,
    scopes: typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [],
    expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
    extra: { userId },
  };
}

// A database client that sends the agent's own token, so every query runs as
// you with the agent's limits.
export function agentSession(auth: AuthInfo): AgentSession {
  const { url, key } = supabaseEnv();
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${auth.token}` } },
  });
  return { supabase, userId: String(auth.extra?.userId), clientId: auth.clientId };
}

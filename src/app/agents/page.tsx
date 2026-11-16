import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { requireTwoFactorUser } from "@/lib/auth";
import { AppHeader } from "../app-header";
import { disconnectAgent } from "./actions";
import { AgentsView, type AgentChange, type ConnectedAgent } from "./agents-view";

export const metadata: Metadata = { title: "Connected agents · Budget Manager" };

async function Agents() {
  const { supabase } = await requireTwoFactorUser();
  const [grants, activity, h] = await Promise.all([
    supabase.auth.oauth.listGrants(),
    supabase.from("agent_activity").select("id, client_id, tool, summary, created_at").order("created_at", { ascending: false }).limit(50),
    headers(),
  ]);
  if (grants.error) console.error("Listing agents failed:", grants.error.message);
  if (activity.error) console.error("Reading agent activity failed:", activity.error.message);

  const agents: ConnectedAgent[] = (grants.data ?? []).map((g) => {
    let website: string | null = null;
    try {
      website = g.client.uri ? new URL(g.client.uri).host : null;
    } catch {}
    return { clientId: g.client.id, name: g.client.name || "AI agent", website, connectedAt: g.granted_at };
  });
  const changes: AgentChange[] = (activity.data ?? []).map((a) => ({
    id: a.id,
    clientId: a.client_id,
    tool: a.tool,
    summary: a.summary,
    at: a.created_at,
  }));
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "budget.torrezhq.com";

  return (
    <>
      {grants.error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">The connected agents list couldn&apos;t load. Try again in a minute.</p>
      ) : null}
      <AgentsView agents={agents} changes={changes} connectUrl={`https://${host}/api/mcp`} onDisconnect={disconnectAgent} />
    </>
  );
}

export default function AgentsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <AppHeader />
      <h1 className="mt-6 text-xl font-semibold">Connected agents</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        AI agents you allowed to read and change your budget, as you, with the limits below.
      </p>
      <Suspense fallback={<p className="mt-6 text-sm">Loading…</p>}>
        <Agents />
      </Suspense>
    </main>
  );
}

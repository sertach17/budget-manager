import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireTwoFactorUser } from "@/lib/auth";
import { AgentLimits } from "../../agents/agent-limits";
import { Card } from "../../ui";
import { ConsentButtons } from "./consent-buttons";

export const metadata: Metadata = { title: "Connect an AI agent · Budget Manager" };

const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{1,100}$/;

// Where Supabase's OAuth server sends you when an AI agent asks to connect.
// You're signed in with two-factor before you see it (the proxy sends you to
// sign in and back), and nothing is shared until you press Allow.
async function Consent({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const { authorization_id: id } = await searchParams;
  const { supabase } = await requireTwoFactorUser();
  if (!id || !AUTHORIZATION_ID.test(id)) {
    return <p className="text-sm">This link isn&apos;t complete. Start the connection again from your AI agent.</p>;
  }

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) {
    if (error) console.error("Reading an agent request failed:", error.message);
    return <p className="text-sm">This request expired. Start the connection again from your AI agent.</p>;
  }
  // You already allowed this agent, so Supabase sends it straight back.
  if ("redirect_url" in data) redirect(data.redirect_url);

  let returnsTo = data.redirect_uri;
  try {
    returnsTo = new URL(data.redirect_uri).host;
  } catch {}

  return (
    <>
      <p className="text-sm">
        <span className="font-semibold">{data.client.name || "An AI agent"}</span> wants to connect to your Budget Manager as{" "}
        {data.user.email}.
      </p>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">It goes back to {returnsTo} when you decide.</p>
      <div className="mt-5">
        <AgentLimits />
      </div>
      <p className="mt-4 text-xs text-black/50 dark:text-white/50">
        You can disconnect it any time under Settings, Connected agents, and see what it changed.
      </p>
      <ConsentButtons authorizationId={data.authorization_id} />
    </>
  );
}

export default function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  return (
    <Card title="Connect an AI agent">
      <Suspense fallback={<p className="text-sm">Loading…</p>}>
        <Consent searchParams={searchParams} />
      </Suspense>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { AgentLimits } from "./agent-limits";

export type ConnectedAgent = { clientId: string; name: string; website: string | null; connectedAt: string };
export type AgentChange = { id: string; clientId: string; tool: string; summary: string; at: string };

const when = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

// The Connected agents page: who's connected, what they changed, and a
// Disconnect button. The demo shows the same page with made-up agents.
export function AgentsView({
  agents,
  changes,
  connectUrl,
  onDisconnect,
}: {
  agents: ConnectedAgent[];
  changes: AgentChange[];
  connectUrl: string;
  onDisconnect: (clientId: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const names = new Map(agents.map((a) => [a.clientId, a.name]));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(connectUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <>
      <section className="mt-6 rounded-2xl border border-black/10 p-4 dark:border-white/15">
        <h2 className="font-semibold">Connect an agent</h2>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Add this address as a custom connector (MCP server) in Claude, ChatGPT or another AI agent. It asks you to sign in
          here with two-factor and to allow it.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-black/5 px-3 py-2 text-sm dark:bg-white/10">{connectUrl}</code>
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded-lg border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-black/60 dark:text-white/60">What an agent can do</summary>
          <div className="mt-2">
            <AgentLimits />
          </div>
        </details>
      </section>

      <h2 className="mt-8 font-semibold">Connected</h2>
      {message ? <p className="mt-2 text-sm text-black/60 dark:text-white/60">{message}</p> : null}
      {agents.length ? (
        <ul className="mt-3 divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
          {agents.map((a) => (
            <li key={a.clientId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{a.name}</p>
                <p className="truncate text-xs text-black/50 dark:text-white/50">
                  Connected {when.format(new Date(a.connectedAt))}
                  {a.website ? ` · ${a.website}` : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await onDisconnect(a.clientId);
                    setMessage(result.ok ? `Disconnected ${a.name}.` : result.message);
                  })
                }
                className="shrink-0 rounded-lg border border-red-600/30 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-600/5 disabled:opacity-50 dark:text-red-400"
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-2xl border border-dashed border-black/15 p-6 text-sm dark:border-white/20">
          No agents connected.
        </p>
      )}

      <h2 className="mt-8 font-semibold">What agents changed</h2>
      {changes.length ? (
        <ul className="mt-3 divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
          {changes.map((c) => (
            <li key={c.id} className="px-4 py-3 text-sm">
              <p>{c.summary}</p>
              <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">
                {names.get(c.clientId) ?? "A disconnected agent"} · {when.format(new Date(c.at))}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-2xl border border-dashed border-black/15 p-6 text-sm dark:border-white/20">
          Nothing changed by an agent yet.
        </p>
      )}
    </>
  );
}

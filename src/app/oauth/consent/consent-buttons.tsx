"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { buttonClass, ErrorText } from "../../ui";
import { allowAgain, approveAgent, denyAgent } from "./actions";

const secondaryClass =
  "block w-full rounded-lg border border-black/15 px-3 py-2 text-center font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10";

export function ConsentButtons({ authorizationId }: { authorizationId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (approve: boolean) =>
    start(async () => {
      const result = await (approve ? approveAgent : denyAgent)(authorizationId);
      if (result && !result.ok) setMessage(result.message);
    });
  return (
    <div className="mt-6 space-y-3">
      <ErrorText message={message} />
      <button type="button" className={buttonClass} disabled={pending} onClick={() => decide(true)}>
        {pending ? "One moment…" : "Allow"}
      </button>
      <button type="button" disabled={pending} onClick={() => decide(false)} className={secondaryClass}>
        Don&apos;t allow
      </button>
    </div>
  );
}

// For an agent you allowed before. Supabase already gave the page the way back
// to it, which works only after you allow it here.
export function AllowAgainButtons({ authorizationId, returnUrl }: { authorizationId: string; returnUrl: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const allow = () =>
    start(async () => {
      const result = await allowAgain(authorizationId);
      if (!result.ok) setMessage(result.message);
      else window.location.assign(returnUrl);
    });
  return (
    <div className="mt-6 space-y-3">
      <ErrorText message={message} />
      <button type="button" className={buttonClass} disabled={pending} onClick={allow}>
        {pending ? "One moment…" : "Allow"}
      </button>
      <Link href="/agents" className={secondaryClass}>
        Don&apos;t allow
      </Link>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { buttonClass, ErrorText } from "../../ui";
import { approveAgent, denyAgent } from "./actions";

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
      <button
        type="button"
        disabled={pending}
        onClick={() => decide(false)}
        className="w-full rounded-lg border border-black/15 px-3 py-2 font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
      >
        Don&apos;t allow
      </button>
    </div>
  );
}

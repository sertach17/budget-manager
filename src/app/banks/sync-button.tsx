"use client";

import { useState, useTransition } from "react";
import { syncBank } from "./actions";

export function SyncButton({ itemId }: { itemId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="text-right">
      <button
        type="button"
        disabled={pending}
        className="rounded-lg border border-black/15 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/20"
        onClick={() =>
          startTransition(async () => {
            const result = await syncBank(itemId);
            setMessage(result.message ?? null);
          })
        }
      >
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {message ? <p className="mt-1 text-xs text-black/60 dark:text-white/60">{message}</p> : null}
    </div>
  );
}

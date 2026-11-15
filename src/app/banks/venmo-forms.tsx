"use client";

import { useActionState } from "react";
import { correctVenmoBalance, startVenmo, type VenmoFormState } from "./venmo-actions";

const input =
  "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20";
const button =
  "rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-emerald-500";

function Message({ state }: { state: VenmoFormState }) {
  if (!state) return null;
  return (
    <p className={`mt-2 text-xs ${state.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>
      {state.message}
    </p>
  );
}

export function StartVenmoForm({ mailbox }: { mailbox: string }) {
  const [state, action, pending] = useActionState(startVenmo, null);
  return (
    <form action={action} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="text-sm">
        <span className="mb-1 block text-xs text-black/60 dark:text-white/60">Venmo balance right now</span>
        <input name="balance" inputMode="decimal" placeholder="0.00" required className={input} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-black/60 dark:text-white/60">Email Venmo writes to</span>
        <input name="mailbox" type="email" defaultValue={mailbox} required className={input} />
      </label>
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving…" : "Start Venmo"}
      </button>
      <div className="sm:col-span-3">
        <Message state={state} />
      </div>
    </form>
  );
}

export function CorrectBalanceForm() {
  const [state, action, pending] = useActionState(correctVenmoBalance, null);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
      <label className="min-w-40 flex-1 text-sm">
        <span className="mb-1 block text-xs text-black/60 dark:text-white/60">Correct balance (from the Venmo app)</span>
        <input name="balance" inputMode="decimal" placeholder="0.00" required className={input} />
      </label>
      <button type="submit" disabled={pending} className="rounded-lg border border-black/15 px-3 py-2 text-sm disabled:opacity-50 dark:border-white/20">
        {pending ? "Saving…" : "Save"}
      </button>
      <div className="w-full">
        <Message state={state} />
      </div>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { linkWalletAccountAction, saveWalletSecret, type WalletFormState } from "./wallet-actions";

const input = "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20";
const quiet = "rounded-lg border border-black/15 px-3 py-2 text-sm disabled:opacity-50 dark:border-white/20";

function Message({ state }: { state: WalletFormState }) {
  if (!state) return null;
  return (
    <p className={`mt-2 text-xs ${state.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>
      {state.message}
    </p>
  );
}

export function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded-lg bg-black/5 px-3 py-2 text-xs dark:bg-white/10">{address}</code>
      <button
        type="button"
        className={quiet}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function SecretForm({ replacing }: { replacing: boolean }) {
  const [state, action, pending] = useActionState(saveWalletSecret, null);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
      <label className="min-w-48 flex-1 text-sm">
        <span className="mb-1 block text-xs text-black/60 dark:text-white/60">
          {replacing ? "New signing secret from WalletFeed" : "Signing secret from WalletFeed"}
        </span>
        <input
          name="secret"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="whsec_…"
          required
          className={input}
        />
      </label>
      <button type="submit" disabled={pending} className={quiet}>
        {pending ? "Saving…" : "Save secret"}
      </button>
      <div className="w-full">
        <Message state={state} />
      </div>
    </form>
  );
}

export function LinkAccountForm({
  walletAccountId,
  current,
  suggested,
  options,
}: {
  walletAccountId: string;
  current: string | null;
  suggested: string | null;
  options: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(linkWalletAccountAction, null);
  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="wallet_account_id" value={walletAccountId} />
      <select name="account_id" defaultValue={current ?? suggested ?? ""} className={`${input} w-auto min-w-40 flex-1`}>
        <option value="">Not linked</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className={quiet}>
        {pending ? "Saving…" : current ? "Change" : "Link"}
      </button>
      <div className="w-full">
        <Message state={state} />
      </div>
    </form>
  );
}

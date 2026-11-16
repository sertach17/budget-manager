"use client";

import { useState, useTransition } from "react";
import type { GoalInput } from "@/lib/budget/goal-input";
import type { Account, Goal } from "@/lib/budget/types";
import type { GoalResult } from "./actions";

// Add or edit a goal: its name, target and date, and which account it
// follows, counting all of its balance or just part of it.

const field = "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20 dark:bg-neutral-900";
const primary = "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-emerald-500";
const plain = "rounded-lg border border-black/15 px-4 py-2 text-sm disabled:opacity-50 dark:border-white/20";
const label = "block text-xs font-medium text-black/60 dark:text-white/60";

export function goalToInput(goal?: Goal): GoalInput {
  if (!goal) return { name: "", target: "", targetDate: "", accountId: "", from: "part", amount: "" };
  return {
    name: goal.name,
    target: String(goal.target),
    targetDate: goal.targetDate ?? "",
    accountId: goal.accountId ?? "",
    from: goal.accountId && goal.setAside === null ? "all" : "part",
    amount: goal.setAside === null ? "" : String(goal.setAside),
  };
}

export function GoalForm({
  goal,
  accounts,
  saveLabel,
  onSave,
  onCancel,
}: {
  goal?: Goal;
  accounts: Account[]; // accounts that can hold a goal
  saveLabel: string;
  onSave: (input: GoalInput) => Promise<GoalResult>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<GoalInput>(() => goalToInput(goal));
  const [message, setMessage] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const set = (patch: Partial<GoalInput>) => setForm((f) => ({ ...f, ...patch }));
  const account = accounts.find((a) => a.id === form.accountId);

  const save = () =>
    start(async () => {
      const result = await onSave(form);
      setMessage(result.ok ? null : result.message);
    });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div>
        <label className={label} htmlFor="goal-name">
          Name
        </label>
        <input id="goal-name" className={`mt-1 ${field}`} placeholder="Summer vacation" value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="goal-target">
            Target
          </label>
          <input
            id="goal-target"
            inputMode="decimal"
            className={`mt-1 ${field}`}
            placeholder="6000"
            value={form.target}
            onChange={(e) => set({ target: e.target.value })}
          />
        </div>
        <div>
          <label className={label} htmlFor="goal-date">
            By (optional)
          </label>
          <input id="goal-date" type="date" className={`mt-1 ${field}`} value={form.targetDate} onChange={(e) => set({ targetDate: e.target.value })} />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="goal-account">
          Saving in
        </label>
        <select id="goal-account" className={`mt-1 ${field}`} value={form.accountId} onChange={(e) => set({ accountId: e.target.value })}>
          <option value="">No account, I&apos;ll type what I&apos;ve saved</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.mask ? ` ···${a.mask}` : ""}
            </option>
          ))}
        </select>
      </div>
      {account ? (
        <fieldset>
          <legend className={label}>How much of {account.name} counts</legend>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="goal-from" checked={form.from === "all"} onChange={() => set({ from: "all" })} />
              All of it
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="goal-from" checked={form.from === "part"} onChange={() => set({ from: "part" })} />
              Part of it
            </label>
          </div>
          {form.from === "part" ? (
            <input
              aria-label="Amount that counts"
              inputMode="decimal"
              className={`mt-2 ${field}`}
              placeholder="2350"
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value })}
            />
          ) : null}
          <p className="mt-2 text-xs text-black/50 dark:text-white/50">
            {form.from === "all"
              ? "The goal follows the account's balance as it changes. Tagged transactions in this account are already in that balance, so they aren't added again."
              : "That amount stays the same until you change it. Transactions you tag to the goal add to it or take from it."}
          </p>
        </fieldset>
      ) : (
        <div>
          <label className={label} htmlFor="goal-amount">
            Saved so far
          </label>
          <input
            id="goal-amount"
            inputMode="decimal"
            className={`mt-1 ${field}`}
            placeholder="0"
            value={form.amount}
            onChange={(e) => set({ amount: e.target.value })}
          />
          <p className="mt-2 text-xs text-black/50 dark:text-white/50">Transactions you tag to the goal add to it or take from it.</p>
        </div>
      )}
      {message ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={primary}>
          {saving ? "Saving…" : saveLabel}
        </button>
        <button type="button" onClick={onCancel} className={plain}>
          Cancel
        </button>
      </div>
    </form>
  );
}

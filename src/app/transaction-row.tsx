"use client";

import type { PickCategory } from "@/lib/budget/types";
import { useState, useTransition } from "react";
import { markReviewed, setTransactionCategory } from "./transactions/actions";
import { setTransactionGoal } from "./goals/actions";
import { CategoryOptions } from "./category-options";
import { useGoalPicker } from "./goal-picker";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export type RowTransaction = {
  id: string;
  description: string;
  amount: number;
  pending: boolean;
  detail: string; // e.g. "Restaurants · Chase Checking ···7682"
  color: string;
  categoryId: string | null; // your category, or null when it follows the bank's
  reviewed: boolean;
  goalId?: string | null; // the goal it's tagged to, if any
};

// One transaction. Tap it to move it to another of your categories, tag it
// to one of your goals (it keeps its category), or mark it reviewed.
// `onMove` and `onReview` replace saving to the database;
// the demo uses them to keep changes in the page only.
export function TransactionRow({
  t,
  categories,
  onMove,
  onReview,
}: {
  t: RowTransaction;
  categories: PickCategory[];
  onMove?: (transactionId: string, categoryId: string) => void;
  onReview?: (transactionIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(t.categoryId ?? "");
  const { goals, onSetGoal } = useGoalPicker();
  const [goalChoice, setGoalChoice] = useState(t.goalId ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [reviewing, startReviewing] = useTransition();

  const review = () =>
    startReviewing(async () => {
      if (onReview) {
        onReview([t.id]);
        setOpen(false);
        return;
      }
      const result = await markReviewed([t.id]);
      if (result.ok) {
        setOpen(false);
        setMessage(null);
      } else {
        setMessage(result.message ?? "Couldn't mark it reviewed.");
      }
    });

  const save = () =>
    startSaving(async () => {
      const moved = choice !== (t.categoryId ?? "");
      const tagged = goalChoice !== (t.goalId ?? "");
      if (onMove || onSetGoal) {
        if (moved) onMove?.(t.id, choice);
        if (tagged) onSetGoal?.(t.id, goalChoice);
        setOpen(false);
        return;
      }
      if (moved) {
        const result = await setTransactionCategory(t.id, choice);
        if (!result.ok) return setMessage(result.message ?? "Couldn't move it.");
      }
      if (tagged) {
        const result = await setTransactionGoal(t.id, goalChoice);
        if (!result.ok) return setMessage(result.message);
      }
      setOpen(false);
      setMessage(null);
    });

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{t.description}</span>
            <span className="block truncate text-xs text-black/50 dark:text-white/50">
              {t.detail}
              {t.pending ? " · Pending" : ""}
              {t.reviewed ? "" : " · To review"}
            </span>
          </span>
        </span>
        <span className={`shrink-0 tabular-nums ${t.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
          {t.amount > 0 ? "+" : ""}
          {money.format(t.amount)}
        </span>
      </button>
      {open ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-black/5 px-4 pb-3 pt-2 dark:border-white/10">
          <label className="sr-only" htmlFor={`category-${t.id}`}>
            Category
          </label>
          <select
            id={`category-${t.id}`}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20 dark:bg-neutral-900"
          >
            <option value="">Sort by my bank&apos;s category</option>
            <CategoryOptions categories={categories} />
          </select>
          {goals.length ? (
            <>
              <label className="sr-only" htmlFor={`goal-${t.id}`}>
                Goal
              </label>
              <select
                id={`goal-${t.id}`}
                value={goalChoice}
                onChange={(e) => setGoalChoice(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20 dark:bg-neutral-900"
              >
                <option value="">No goal</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    Goal: {g.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {t.reviewed ? null : (
            <button
              type="button"
              onClick={review}
              disabled={reviewing}
              className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 disabled:opacity-50 dark:text-emerald-400"
            >
              {reviewing ? "Saving…" : "Mark reviewed"}
            </button>
          )}
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm">
            Cancel
          </button>
          {message ? (
            <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

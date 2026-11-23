"use client";

import type { PickCategory } from "@/lib/budget/types";
import { useState, useTransition } from "react";
import { TransactionRow, type RowTransaction } from "./transaction-row";
import { markReviewed } from "./transactions/actions";

// "Pending to review" on the dashboard: transactions that arrived since you
// last looked. Tap one to move or review it, or mark them all reviewed.
export function ReviewList({
  rows,
  categories,
  onMove,
  onReview,
}: {
  rows: RowTransaction[];
  categories: PickCategory[];
  onMove?: (transactionId: string, categoryId: string) => void;
  onReview?: (transactionIds: string[]) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  if (!rows.length) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-dashed border-white/15 px-4 py-3 text-sm text-white/60">
        <span aria-hidden="true" className="text-emerald-400">
          ✓
        </span>
        You&apos;re all caught up.
      </p>
    );
  }

  const reviewAll = () =>
    startSaving(async () => {
      const ids = rows.map((r) => r.id);
      if (onReview) {
        onReview(ids);
        return;
      }
      const result = await markReviewed(ids);
      setMessage(result.ok ? null : (result.message ?? "Couldn't mark them reviewed."));
    });

  return (
    <div>
      <ul className="card divide-y divide-line overflow-hidden">
        {rows.map((row) => (
          <TransactionRow key={row.id} t={row} categories={categories} onMove={onMove} onReview={onReview} />
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-white/45">Tap one to change or review it.</p>
        <button
          type="button"
          onClick={reviewAll}
          disabled={saving}
          className="pressable shrink-0 rounded-full border border-violet-400/40 bg-violet-500/10 px-3.5 py-1.5 text-sm font-medium text-violet-200 disabled:opacity-50"
        >
          {saving ? "Saving…" : rows.length === 1 ? "Mark reviewed" : `Mark all ${rows.length} reviewed`}
        </button>
      </div>
      {message ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      ) : null}
    </div>
  );
}

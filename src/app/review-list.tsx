"use client";

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
  categories: { id: string; name: string }[];
  onMove?: (transactionId: string, categoryId: string) => void;
  onReview?: (transactionIds: string[]) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  if (!rows.length) {
    return (
      <p className="rounded-2xl border border-dashed border-black/15 px-4 py-3 text-sm text-black/60 dark:border-white/20 dark:text-white/60">
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
      <ul className="divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
        {rows.map((row) => (
          <TransactionRow key={row.id} t={row} categories={categories} onMove={onMove} onReview={onReview} />
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-black/50 dark:text-white/50">Tap one to move it or mark it reviewed.</p>
        <button
          type="button"
          onClick={reviewAll}
          disabled={saving}
          className="shrink-0 rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/20 disabled:opacity-50"
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

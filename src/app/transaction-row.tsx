"use client";

import type { PickCategory } from "@/lib/budget/types";
import { useEffect, useId, useRef, useState, useTransition } from "react";
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

// The coloured circle with the first letter of the name, in the category's colour.
function Avatar({ t, large = false }: { t: RowTransaction; large?: boolean }) {
  const letter = t.description.trim().charAt(0).toUpperCase() || "•";
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${large ? "h-12 w-12 text-lg" : "h-10 w-10 text-[15px]"}`}
      style={{
        backgroundColor: `color-mix(in srgb, ${t.color} 20%, transparent)`,
        color: `color-mix(in srgb, ${t.color} 70%, white)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${t.color} 35%, transparent)`,
      }}
    >
      {letter}
    </span>
  );
}

function Amount({ amount, className = "" }: { amount: number; className?: string }) {
  return (
    <span className={`tabular-nums ${amount > 0 ? "text-emerald-400" : ""} ${className}`}>
      {amount > 0 ? "+" : ""}
      {money.format(amount)}
    </span>
  );
}

// Small tags for a pending charge or one you haven't reviewed yet.
function Tags({ t }: { t: RowTransaction }) {
  if (!t.pending && t.reviewed) return null;
  return (
    <span className="flex justify-end gap-1">
      {t.pending ? <span className="rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-medium text-white/60">Pending</span> : null}
      {t.reviewed ? null : (
        <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">To review</span>
      )}
    </span>
  );
}

// One transaction. Tap it to open a panel where you move it to another of
// your categories, tag it to one of your goals (it keeps its category), or
// mark it reviewed. On a phone the panel slides up from the bottom of the
// screen, with each choice full width and labelled.
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
  const sheet = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Open and close the panel as a modal, so it sits above everything and
  // Escape or the phone's back gesture closes it.
  useEffect(() => {
    const dialog = sheet.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

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
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-white/[0.03] active:bg-white/[0.06]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="relative shrink-0">
            <Avatar t={t} />
            {t.reviewed ? null : (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[#131726] bg-violet-400"
              />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{t.description}</span>
            <span className="block truncate text-xs text-white/50">
              {t.detail}
              {/* Read out what the dot and the grey word show. */}
              {t.reviewed ? "" : <span className="sr-only"> · To review</span>}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <Amount amount={t.amount} className="font-medium" />
          {t.pending ? <span className="text-[11px] text-white/45">Pending</span> : null}
        </span>
      </button>
      <dialog
        ref={sheet}
        className="sheet"
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // A tap on the dimmed area around the panel closes it.
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className="rounded-t-[1.75rem] border border-line bg-[#141828] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl shadow-black/60 sm:rounded-[1.75rem] sm:pb-5">
          <div aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-white/20 sm:hidden" />
          <div className="mt-4 flex items-start gap-3">
            <Avatar t={t} large />
            <div className="min-w-0 flex-1">
              <h2 id={titleId} tabIndex={-1} autoFocus className="text-lg font-semibold leading-snug outline-none">
                {t.description}
              </h2>
              <p className="mt-0.5 text-sm text-white/55">{t.detail}</p>
            </div>
            <Amount amount={t.amount} className="pt-0.5 text-lg font-semibold" />
          </div>
          {t.pending || !t.reviewed ? (
            <div className="mt-3">
              <Tags t={t} />
            </div>
          ) : null}

          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div>
              <label htmlFor={`category-${t.id}`} className="mb-1.5 block text-sm font-medium text-white/70">
                Category
              </label>
              <select id={`category-${t.id}`} value={choice} onChange={(e) => setChoice(e.target.value)} className="field">
                <option value="">Sort by my bank&apos;s category</option>
                <CategoryOptions categories={categories} />
              </select>
            </div>
            {goals.length ? (
              <div>
                <label htmlFor={`goal-${t.id}`} className="mb-1.5 block text-sm font-medium text-white/70">
                  Goal
                </label>
                <select id={`goal-${t.id}`} value={goalChoice} onChange={(e) => setGoalChoice(e.target.value)} className="field">
                  <option value="">No goal</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {message ? (
              <p role="alert" className="text-sm text-rose-400">
                {message}
              </p>
            ) : null}

            <div className="grid gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="btn-primary pressable rounded-2xl px-4 py-3 text-base font-semibold disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              {t.reviewed ? null : (
                <button
                  type="button"
                  onClick={review}
                  disabled={reviewing}
                  className="pressable rounded-2xl border border-violet-400/40 bg-violet-500/10 px-4 py-3 text-base font-medium text-violet-200 disabled:opacity-50"
                >
                  {reviewing ? "Saving…" : "Mark reviewed"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="pressable rounded-2xl px-4 py-3 text-base font-medium text-white/60 hover:bg-white/[0.05]"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </li>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { GoalInput } from "@/lib/budget/goal-input";
import { canHoldGoal, goalProgress } from "@/lib/budget/goals";
import type { BudgetData, PickCategory } from "@/lib/budget/types";
import { toRows } from "../budget/rows";
import { TransactionRow } from "../transaction-row";
import { deleteGoal, updateGoal, type GoalResult } from "./actions";
import { GoalCard } from "./goal-card";
import { GoalForm } from "./goal-form";

// One goal: its progress, the transactions tagged to it, and buttons to edit
// or delete it. Shared by the signed-in site and the demo, which passes the
// `on…` handlers to keep changes in the page.

const plain = "rounded-lg border border-black/15 px-4 py-2 text-sm disabled:opacity-50 dark:border-white/20";
const danger = "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

export function GoalView({
  data,
  goalId,
  today,
  base = "",
  yourCategories,
  onMove,
  onReview,
  onUpdate,
  onDelete,
}: {
  data: BudgetData;
  goalId: string;
  today: string;
  base?: string;
  yourCategories: PickCategory[];
  onMove?: (transactionId: string, categoryId: string) => void;
  onReview?: (transactionIds: string[]) => void;
  onUpdate?: (id: string, input: GoalInput) => Promise<GoalResult>;
  onDelete?: (id: string) => Promise<GoalResult>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, start] = useTransition();

  const goal = data.goals?.find((g) => g.id === goalId);
  const back = (
    <Link href={`${base}/goals`} className="text-sm text-black/60 hover:text-emerald-600 dark:text-white/60 dark:hover:text-emerald-400">
      ← Goals
    </Link>
  );
  if (!goal) {
    return (
      <div className="mt-6">
        {back}
        <p className="mt-6 text-sm">That goal couldn&apos;t be found.</p>
      </div>
    );
  }

  const progress = goalProgress(goal, data, today);
  const tagged = data.transactions
    .filter((t) => t.goalId === goal.id && t.postedOn <= today)
    .sort((a, b) => b.postedOn.localeCompare(a.postedOn) || a.id.localeCompare(b.id));
  const wholeBalance = progress.account !== null && goal.setAside === null;

  const remove = () =>
    start(async () => {
      const result = await (onDelete ?? deleteGoal)(goal.id);
      if (result.ok) router.push(`${base}/goals`);
      else setMessage(result.message);
    });

  return (
    <div className="mt-6">
      {back}
      <h1 className="sr-only">{goal.name}</h1>

      <div className="mt-4">
        {editing ? (
          <section className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
            <GoalForm
              goal={goal}
              accounts={data.accounts.filter(canHoldGoal)}
              saveLabel="Save"
              onCancel={() => setEditing(false)}
              onSave={async (input) => {
                const result = await (onUpdate ?? updateGoal)(goal.id, input);
                if (result.ok) setEditing(false);
                return result;
              }}
            />
          </section>
        ) : (
          <GoalCard progress={progress} />
        )}
      </div>

      {editing ? null : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {confirming ? (
            <>
              <p className="w-full text-sm">Delete {goal.name}? Its transactions stay, without the goal tag.</p>
              <button type="button" onClick={remove} disabled={deleting} className={danger}>
                {deleting ? "Deleting…" : "Delete goal"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={plain}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setEditing(true)} className={plain}>
                Edit goal
              </button>
              <button type="button" onClick={() => setConfirming(true)} className={plain}>
                Delete
              </button>
            </>
          )}
          {message ? (
            <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">
              {message}
            </p>
          ) : null}
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">Tagged transactions</h2>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Tap any transaction, on any page, and pick this goal to tag it. It keeps its budget category.
          {wholeBalance ? ` Ones in ${progress.account?.name} are already in its balance, so they aren't added again.` : ""}
        </p>
        {tagged.length ? (
          <ul className="mt-3 divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
            {toRows(data, tagged, "both").map((row) => (
              <TransactionRow key={row.id} t={row} categories={yourCategories} onMove={onMove} onReview={onReview} />
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl border border-dashed border-black/15 p-4 text-sm text-black/60 dark:border-white/20 dark:text-white/60">
            No transactions tagged yet.
          </p>
        )}
      </section>
    </div>
  );
}

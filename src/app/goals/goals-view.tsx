"use client";

import { useState } from "react";
import type { GoalInput } from "@/lib/budget/goal-input";
import { allGoalProgress, canHoldGoal } from "@/lib/budget/goals";
import type { BudgetData } from "@/lib/budget/types";
import { createGoal, type GoalResult } from "./actions";
import { GoalCard } from "./goal-card";
import { GoalForm } from "./goal-form";

// The Goals page: every goal with its progress, and a button to add one.
// Shared by the signed-in site and the demo, which passes `onCreate` to keep
// new goals in the page.

const primary = "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-emerald-500";

export function GoalsView({
  data,
  today,
  base = "",
  onCreate,
}: {
  data: BudgetData;
  today: string;
  base?: string;
  onCreate?: (input: GoalInput) => Promise<GoalResult>;
}) {
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const goals = allGoalProgress(data, today);
  const accounts = data.accounts.filter(canHoldGoal);

  return (
    <div className="mt-6">
      {adding ? (
        <section className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
          <h2 className="mb-4 font-medium">New goal</h2>
          <GoalForm
            accounts={accounts}
            saveLabel="Add goal"
            onCancel={() => setAdding(false)}
            onSave={async (input) => {
              const result = await (onCreate ?? createGoal)(input);
              if (result.ok) {
                setAdding(false);
                setNotice(result.message);
              }
              return result;
            }}
          />
        </section>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={primary}>
          + New goal
        </button>
      )}
      {notice && !adding ? <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : null}

      {goals.length ? (
        <ul className="mt-6 space-y-3">
          {goals.map((p) => (
            <li key={p.goal.id}>
              <GoalCard progress={p} href={`${base}/goals/${encodeURIComponent(p.goal.id)}`} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-2xl border border-dashed border-black/15 p-6 text-sm text-black/60 dark:border-white/20 dark:text-white/60">
          No goals yet. Add one for something you&apos;re saving toward, like a trip, and follow it here and on the dashboard.
        </p>
      )}
    </div>
  );
}

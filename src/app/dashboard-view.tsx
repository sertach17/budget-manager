import Link from "next/link";
import { allGoalProgress } from "@/lib/budget/goals";
import { summarizeMonth } from "@/lib/budget/summary";
import type { BudgetData, PickCategory } from "@/lib/budget/types";
import { toRows } from "./budget/rows";
import { BudgetCard } from "./budget-card";
import { GoalCard } from "./goals/goal-card";
import { ReviewList } from "./review-list";
import { TransactionRow } from "./transaction-row";

// The main dashboard. It only takes data, so the demo page and the
// signed-in home page share it. `base` is "" on the real site and "/demo"
// in the demo, so every link stays on the same site.

const wholeMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function formatMonth(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

// A section with a title, and a link to its own page when it has one.
function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-white/90">{title}</h2>
        {href ? (
          <Link href={href} className="text-sm font-medium text-emerald-400 hover:text-emerald-300">
            See all <span aria-hidden="true">›</span>
          </Link>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function DashboardView({
  data,
  today,
  base = "",
  yourCategories,
  onMove,
  onReview,
}: {
  data: BudgetData;
  today: string;
  base?: string;
  yourCategories: PickCategory[];
  onMove?: (transactionId: string, categoryId: string) => void;
  onReview?: (transactionIds: string[]) => void;
}) {
  const summary = summarizeMonth(data, today);
  // The goals with the closest dates first.
  const goals = allGoalProgress(data, today).slice(0, 3);

  return (
    <div className="stagger">
      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-white/70">{formatMonth(summary.month)}</p>
        <span className="rounded-full border border-line bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-white/60">
          {summary.daysLeft} {summary.daysLeft === 1 ? "day" : "days"} left
        </span>
      </div>

      <div className="mt-3">
        <BudgetCard summary={summary} href={`${base}/budget`} />
      </div>

      <Link href={`${base}/income`} className="card pressable mt-3 flex items-center gap-3 p-4 hover:border-white/15">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium uppercase tracking-wider text-white/50">Income this month</span>
          <span className="mt-0.5 block text-lg font-semibold tabular-nums">{wholeMoney.format(summary.income)}</span>
        </span>
        <span aria-hidden="true" className="text-xl text-white/35">
          ›
        </span>
      </Link>

      <Section title={summary.toReview.length ? `To review (${summary.toReview.length})` : "To review"}>
        <ReviewList rows={toRows(data, summary.toReview, "both")} categories={yourCategories} onMove={onMove} onReview={onReview} />
      </Section>

      <Section title="Goals" href={`${base}/goals`}>
        {goals.length ? (
          <ul className="space-y-3">
            {goals.map((p) => (
              <li key={p.goal.id}>
                <GoalCard progress={p} href={`${base}/goals/${encodeURIComponent(p.goal.id)}`} compact />
              </li>
            ))}
          </ul>
        ) : (
          <Link
            href={`${base}/goals`}
            className="block rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/60 hover:bg-white/[0.03]"
          >
            Set a goal for something you&apos;re saving toward ›
          </Link>
        )}
      </Section>

      <Section title="Recent transactions" href={`${base}/transactions`}>
        <ul className="card divide-y divide-line overflow-hidden">
          {toRows(data, summary.recent, "both").map((row) => (
            <TransactionRow key={row.id} t={row} categories={yourCategories} onMove={onMove} onReview={onReview} />
          ))}
        </ul>
      </Section>
    </div>
  );
}

import Link from "next/link";
import type { GoalProgress } from "@/lib/budget/goals";

// One goal: how much is saved, a progress bar, and what it takes each month
// to finish on time. Shared by the Goals page, a goal's page, the dashboard
// and the demo. With `href` the whole card opens that goal.

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const wholeMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function formatGoalDate(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// Where the goal's money comes from, in a few words.
export function goalSource(p: GoalProgress) {
  const { goal, account } = p;
  if (goal.accountId && !account) return "Its account is gone or hidden";
  if (!account) return goal.setAside ? `${money.format(goal.setAside)} saved by hand` : "Saved by hand";
  return goal.setAside === null ? `All of ${account.name}` : `${money.format(goal.setAside)} of ${account.name}`;
}

export function GoalCard({ progress: p, href, compact = false }: { progress: GoalProgress; href?: string; compact?: boolean }) {
  const done = p.left === 0;
  const plan = done
    ? "Reached"
    : p.pastDate
      ? `${wholeMoney.format(p.left)} to go · the date has passed`
      : p.perMonth !== null
        ? `${money.format(p.perMonth)} a month to reach it by ${formatGoalDate(p.goal.targetDate!)}`
        : `${wholeMoney.format(p.left)} to go`;

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-medium">{p.goal.name}</p>
        <p className="shrink-0 text-sm tabular-nums">
          <span className="font-semibold">{wholeMoney.format(p.saved)}</span>
          <span className="text-black/50 dark:text-white/50"> of {wholeMoney.format(p.goal.target)}</span>
        </p>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
        role="progressbar"
        aria-label={`${p.goal.name} progress`}
        aria-valuenow={Math.round(p.percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-emerald-600"}`} style={{ width: `${p.percent}%` }} />
      </div>
      <p className={`mt-2 text-xs ${p.pastDate ? "text-amber-700 dark:text-amber-300" : "text-black/60 dark:text-white/60"}`}>{plan}</p>
      {compact ? null : (
        <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">
          {goalSource(p)}
          {p.taggedCount
            ? ` · ${p.tagged >= 0 ? "+" : "−"}${money.format(Math.abs(p.tagged))} from ${p.taggedCount} tagged ${
                p.taggedCount === 1 ? "transaction" : "transactions"
              }`
            : ""}
        </p>
      )}
      {p.shortBy > 0 ? (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          {p.account?.name} has {money.format(p.shortBy)} less than your goals set aside from it.
        </p>
      ) : null}
    </>
  );

  const box = "block rounded-2xl border border-black/10 p-4 dark:border-white/15";
  return href ? (
    <Link href={href} className={`${box} hover:bg-black/[0.02] dark:hover:bg-white/[0.03]`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

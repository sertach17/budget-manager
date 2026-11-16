import Link from "next/link";
import type { MonthSummary } from "@/lib/budget/summary";

const wholeMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const W = 320;
const H = 140;

// The top card on the dashboard: what you've spent against your budget, with
// a line of this month's spending against an even pace through the month.
// With `href`, the whole card opens that page (your budget categories).
export function BudgetCard({ summary, href }: { summary: MonthSummary; href?: string }) {
  const { spent, budgeted, spentByDay, daysInMonth } = summary;
  const day = spentByDay.length;
  const hasBudget = budgeted > 0;
  const left = budgeted - spent;

  // Where you'd be today if you spent the budget evenly through the month.
  const pace = hasBudget ? (budgeted * day) / daysInMonth : 0;
  const vsPace = spent - pace;
  const overPace = hasBudget && vsPace > 0;

  const top = Math.max(budgeted, spent, ...spentByDay, 1) * 1.1;
  const x = (d: number) => (d / daysInMonth) * W;
  const y = (amount: number) => H - (Math.max(amount, 0) / top) * H;
  const points = [[0, 0], ...spentByDay.map((amount, i) => [i + 1, amount])]
    .map(([d, amount]) => `${x(d).toFixed(1)},${y(amount).toFixed(1)}`)
    .join(" ");
  const endX = x(day);
  const endY = y(spentByDay[day - 1] ?? 0);

  const headline = hasBudget
    ? left < 0
      ? `${wholeMoney.format(-left)} over`
      : `${wholeMoney.format(left)} left`
    : `${wholeMoney.format(spent)} spent`;

  const card = (
    <>
      <div className="text-center">
        <p className={`text-3xl font-semibold tabular-nums ${hasBudget && left < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
          {headline}
        </p>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60 tabular-nums">
          {hasBudget ? `${wholeMoney.format(spent)} spent of ${wholeMoney.format(budgeted)} budgeted` : "this month"}
        </p>
      </div>

      <div className="relative mt-5">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" aria-hidden="true">
          {hasBudget ? (
            <line
              x1={0}
              y1={H}
              x2={W}
              y2={y(budgeted)}
              strokeDasharray="4 5"
              strokeWidth={1.5}
              className="stroke-black/25 dark:stroke-white/25"
            />
          ) : null}
          <polyline
            points={points}
            fill="none"
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
            className={overPace ? "stroke-red-500" : "stroke-emerald-500"}
          />
          <circle
            cx={endX}
            cy={endY}
            r={5}
            strokeWidth={3}
            className={`fill-white dark:fill-neutral-950 ${overPace ? "stroke-red-500" : "stroke-emerald-500"}`}
          />
        </svg>
        {hasBudget ? (
          <span
            className={`absolute -translate-x-1/2 translate-y-3 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums text-white ${
              overPace ? "bg-red-500" : "bg-emerald-600"
            }`}
            style={{
              left: `${Math.min(Math.max((endX / W) * 100, 15), 85)}%`,
              top: `${(endY / H) * 100}%`,
            }}
          >
            {wholeMoney.format(Math.abs(vsPace))} {overPace ? "over" : "under"} pace
          </span>
        ) : null}
      </div>
    </>
  );

  const box = "block rounded-3xl border border-black/10 p-5 dark:border-white/15";
  return href ? (
    <Link href={href} className={`${box} hover:bg-black/[0.02] dark:hover:bg-white/[0.03]`}>
      {card}
    </Link>
  ) : (
    <div className={box}>{card}</div>
  );
}

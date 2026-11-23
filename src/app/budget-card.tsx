import Link from "next/link";
import type { MonthSummary } from "@/lib/budget/summary";
import { AnimatedMoney } from "./animated-number";

const wholeMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const W = 320;
const H = 56;

// The top card on the dashboard: what's left of your budget, a bar of spent
// against budgeted with a mark for where an even pace would put you today,
// and a small line of this month's spending. With `href`, the whole card
// opens that page (your budget categories).
export function BudgetCard({ summary, href }: { summary: MonthSummary; href?: string }) {
  const { spent, budgeted, spentByDay, daysInMonth } = summary;
  const day = spentByDay.length;
  const hasBudget = budgeted > 0;
  const left = budgeted - spent;
  const over = hasBudget && left < 0;

  // Where you'd be today if you spent the budget evenly through the month.
  const pace = hasBudget ? (budgeted * day) / daysInMonth : 0;
  const vsPace = spent - pace;
  const overPace = hasBudget && vsPace > 0;

  const top = Math.max(budgeted, spent, ...spentByDay, 1) * 1.08;
  const x = (d: number) => (d / daysInMonth) * W;
  const y = (amount: number) => H - (Math.max(amount, 0) / top) * H;
  const coords = [[0, 0], ...spentByDay.map((amount, i) => [i + 1, amount])].map(
    ([d, amount]) => `${x(d).toFixed(1)},${y(amount).toFixed(1)}`,
  );
  const line = coords.join(" ");
  const area = `M0,${H} L${coords.join(" L")} L${x(day).toFixed(1)},${H} Z`;
  const endX = x(day);
  const endY = y(spentByDay[day - 1] ?? 0);

  const share = hasBudget ? Math.min(spent / budgeted, 1) : 0;
  const paceShare = hasBudget ? Math.min(pace / budgeted, 1) : 0;
  const stops = overPace ? ["#fb7185", "#f97316"] : ["#34d399", "#38bdf8"];

  const card = (
    <>
      {/* A soft glow in the corner, coloured by how the month is going. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full blur-3xl ${
          overPace ? "bg-rose-500/20" : "bg-emerald-400/15"
        }`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-white/50">
            {hasBudget ? (over ? "Over budget" : "Left to spend") : "Spent this month"}
          </p>
          <p className={`mt-1 text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums ${over ? "text-rose-400" : ""}`}>
            <AnimatedMoney value={hasBudget ? Math.abs(left) : spent} />
          </p>
        </div>
        {hasBudget ? (
          <span
            className={`mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
              overPace ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300"
            }`}
          >
            {wholeMoney.format(Math.abs(vsPace))} {overPace ? "over" : "under"} pace
          </span>
        ) : null}
      </div>

      {hasBudget ? (
        <div className="relative mt-4">
          <div className="relative h-2.5 rounded-full bg-white/[0.07]">
            <div
              className="h-full origin-left animate-grow rounded-full"
              style={{ width: `${share * 100}%`, backgroundImage: `linear-gradient(90deg, ${stops[0]}, ${stops[1]})` }}
            />
            {/* Where an even pace would put you today. */}
            <span
              aria-hidden="true"
              className="absolute -top-1 h-[1.125rem] w-0.5 -translate-x-1/2 rounded-full bg-white/70"
              style={{ left: `${paceShare * 100}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-xs tabular-nums text-white/50">
            <span>{wholeMoney.format(spent)} spent</span>
            <span>{wholeMoney.format(budgeted)} budget</span>
          </div>
        </div>
      ) : null}

      <div className="relative mt-3 h-14 animate-reveal">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id="budget-card-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={stops[0]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stops[0]} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="budget-card-line" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor={stops[0]} />
              <stop offset="100%" stopColor={stops[1]} />
            </linearGradient>
          </defs>
          {hasBudget ? (
            <line
              x1={0}
              y1={H}
              x2={W}
              y2={y(budgeted)}
              strokeDasharray="3 5"
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
              className="stroke-white/25"
            />
          ) : null}
          <path d={area} fill="url(#budget-card-area)" />
          <polyline
            points={line}
            fill="none"
            stroke="url(#budget-card-line)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span
          aria-hidden="true"
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#131726]"
          style={{ left: `${(endX / W) * 100}%`, top: `${(endY / H) * 100}%`, backgroundColor: stops[1], boxShadow: `0 0 0 4px ${stops[1]}33` }}
        />
      </div>
    </>
  );

  const box = "card relative block overflow-hidden p-4 sm:p-5";
  return href ? (
    <Link href={href} className={`${box} pressable hover:border-white/15`}>
      {card}
    </Link>
  ) : (
    <div className={box}>{card}</div>
  );
}

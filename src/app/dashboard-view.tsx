import Link from "next/link";
import { summarizeMonth } from "@/lib/budget/summary";
import type { BudgetData, PickCategory } from "@/lib/budget/types";
import { toRows } from "./budget/rows";
import { BudgetCard } from "./budget-card";
import { ReviewList } from "./review-list";
import { TransactionRow } from "./transaction-row";

// The main dashboard. It only takes data, so the demo page and the
// signed-in home page share it. `base` is "" on the real site and "/demo"
// in the demo, so every link stays on the same site.

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const wholeMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function formatMonth(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

const sectionTitle = "text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60";

// A section whose title can open a page of its own.
function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className={sectionTitle}>
        {href ? (
          <Link href={href} className="inline-flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-400">
            {title} <span aria-hidden="true">›</span>
          </Link>
        ) : (
          title
        )}
      </h2>
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

  return (
    <div>
      <p className="mt-6 text-sm text-black/60 dark:text-white/60">
        {formatMonth(summary.month)} · {summary.daysLeft} {summary.daysLeft === 1 ? "day" : "days"} left
      </p>

      <div className="mt-3">
        <BudgetCard summary={summary} href={`${base}/budget`} />
      </div>

      <Section title={summary.toReview.length ? `Pending to review (${summary.toReview.length})` : "Pending to review"}>
        <ReviewList rows={toRows(data, summary.toReview, "both")} categories={yourCategories} onMove={onMove} onReview={onReview} />
      </Section>

      <Link
        href={`${base}/income`}
        className="mt-8 flex items-center justify-between gap-3 rounded-2xl border border-black/10 p-4 hover:bg-black/[0.02] dark:border-white/15 dark:hover:bg-white/[0.03]"
      >
        <span>
          <span className="block text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">Income</span>
          <span className="mt-1 block text-xl font-semibold tabular-nums">{wholeMoney.format(summary.income)}</span>
          <span className="mt-0.5 block text-xs text-black/50 dark:text-white/50">this month</span>
        </span>
        <span aria-hidden="true" className="text-xl text-black/40 dark:text-white/40">
          ›
        </span>
      </Link>

      <Section title="Recent transactions" href={`${base}/transactions`}>
        <ul className="divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
          {toRows(data, summary.recent, "both").map((row) => (
            <TransactionRow key={row.id} t={row} categories={yourCategories} onMove={onMove} onReview={onReview} />
          ))}
        </ul>
      </Section>

      <Section title="Accounts" href={`${base}/banks`}>
        <ul className="divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
          {data.accounts.map((account) => (
            <li key={account.id}>
              <Link
                href={`${base}/accounts/${encodeURIComponent(account.id)}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
              >
                <div>
                  <p className="font-medium">{account.name}</p>
                  <p className="text-xs text-black/50 dark:text-white/50">
                    {account.institution}
                    {account.mask ? ` ···${account.mask}` : ""}
                  </p>
                </div>
                <span className="tabular-nums">
                  {account.type === "credit" || account.type === "loan"
                    ? `${money.format(account.currentBalance)} owed`
                    : money.format(account.currentBalance)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

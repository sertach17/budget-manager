import { summarizeMonth } from "@/lib/budget/summary";
import type { BudgetData } from "@/lib/budget/types";
import { BudgetCard } from "./budget-card";

// The main dashboard. It only takes data, so the demo page and the
// signed-in home page share it.

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const wholeMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function formatMonth(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function formatDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
      <p className="text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {note ? <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">{note}</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// `budgetHref` makes the budget card open that page; the demo leaves it out.
export function DashboardView({ data, today, budgetHref }: { data: BudgetData; today: string; budgetHref?: string }) {
  const summary = summarizeMonth(data, today);
  const categories = new Map(data.categories.map((c) => [c.id, c]));

  return (
    <div>
      <p className="mt-6 text-sm text-black/60 dark:text-white/60">
        {formatMonth(summary.month)} · {summary.daysLeft} {summary.daysLeft === 1 ? "day" : "days"} left
      </p>

      <div className="mt-3">
        <BudgetCard summary={summary} href={budgetHref} />
      </div>

      <Section title="So far today">
        {summary.today.length ? (
          <ul className="divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
            {summary.today.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 truncate">
                  {t.description}
                  {t.pending ? <span className="text-black/50 dark:text-white/50"> · Pending</span> : null}
                </span>
                <span className={`shrink-0 tabular-nums ${t.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                  {t.amount > 0 ? "+" : ""}
                  {money.format(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-black/15 px-4 py-3 text-sm text-black/60 dark:border-white/20 dark:text-white/60">
            Nothing yet today.
          </p>
        )}
      </Section>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <Stat label="Income" value={wholeMoney.format(summary.income)} note="this month" />
        <Stat label="Net worth" value={wholeMoney.format(summary.netWorth)} note="all accounts" />
      </div>

      {/* With a Budget page to open, the full list lives there. */}
      {budgetHref ? null : (
      <Section title={summary.budgeted > 0 ? "Budgets" : "Spending by category"}>
        <ul className="space-y-3">
          {summary.byCategory.map(({ category, spent, budget }) => {
            const share = budget ? Math.min(spent / budget, 1) : 1;
            const over = budget !== null && spent > budget;
            return (
              <li key={category.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{category.name}</span>
                  <span className={`tabular-nums ${over ? "text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}`}>
                    {wholeMoney.format(spent)}
                    {budget !== null ? ` of ${wholeMoney.format(budget)}` : ""}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.round(share * 100)}%`, backgroundColor: over ? "#dc2626" : category.color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
      )}

      <Section title="Recent transactions">
        <ul className="divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
          {summary.recent.map((t) => {
            const category = t.categoryId ? categories.get(t.categoryId) : undefined;
            return (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.description}</p>
                  <p className="text-xs text-black/50 dark:text-white/50">
                    {formatDay(t.postedOn)}
                    {category ? ` · ${category.name}` : ""}
                    {t.pending ? " · Pending" : ""}
                  </p>
                </div>
                <span className={`shrink-0 tabular-nums ${t.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                  {t.amount > 0 ? "+" : ""}
                  {money.format(t.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Accounts">
        <ul className="divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
          {data.accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{account.name}</p>
                <p className="text-xs text-black/50 dark:text-white/50">
                  {account.institution}
                  {account.mask ? ` ···${account.mask}` : ""}
                </p>
              </div>
              <span className="tabular-nums">
                {account.type === "credit" || account.type === "loan" ? `${money.format(account.currentBalance)} owed` : money.format(account.currentBalance)}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

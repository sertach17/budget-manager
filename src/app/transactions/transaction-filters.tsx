"use client";

import type { Category } from "@/lib/budget/types";
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  filtersToSearch,
  readFilters,
  SORT_LABELS,
  type ReviewStatus,
  type TransactionFilters as Filters,
  type TransactionSort,
} from "@/lib/budget/filter-transactions";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

// The search box, sort list and filters above the transactions. Every choice
// goes into the page address, so it survives a refresh and the back button,
// and the signed-in page reloads with only the matching rows.

const STATUS_LABELS: Record<ReviewStatus, string> = { all: "All", review: "To review", reviewed: "Reviewed" };
const KIND_LABELS: Record<string, string> = { expense: "Spending", income: "Income", transfer: "Transfers (not counted)" };

export function TransactionFilters({
  accounts,
  categories,
  matches,
}: {
  accounts: { id: string; label: string }[];
  categories: Category[];
  matches: number; // how many transactions the choices find
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = readFilters(params);
  const [query, setQuery] = useState(filters.q);
  const [open, setOpen] = useState(activeFilterCount(filters) > 0);
  const [pending, startTransition] = useTransition();
  const typing = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The search this box last put in the address.
  const [sent, setSent] = useState(filters.q);

  const go = (next: Partial<Filters>) => {
    if (next.q !== undefined) setSent(next.q);
    const search = filtersToSearch({ ...readFilters(params), ...next });
    startTransition(() => router.replace(`${pathname}${search}`, { scroll: false }));
  };

  // Search a moment after typing stops, so each letter doesn't reload.
  const type = (value: string) => {
    setQuery(value);
    if (typing.current) clearTimeout(typing.current);
    typing.current = setTimeout(() => go({ q: value.trim() }), 350);
  };
  useEffect(() => () => {
    if (typing.current) clearTimeout(typing.current);
  }, []);

  // Back and forward change the address without this box; follow them,
  // but never undo letters typed since the last search went out.
  const [seenQuery, setSeenQuery] = useState(filters.q);
  if (seenQuery !== filters.q) {
    setSeenQuery(filters.q);
    if (filters.q !== sent) {
      setSent(filters.q);
      setQuery(filters.q);
    }
  }

  const count = activeFilterCount(filters);
  const narrowed = Boolean(filters.q) || count > 0;
  const groups = ["expense", "income", "transfer"]
    .map((kind) => ({
      kind,
      list: categories.filter((c) => c.kind === kind).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.list.length);

  const clearAll = () => {
    if (typing.current) clearTimeout(typing.current);
    setQuery("");
    go({ ...DEFAULT_FILTERS, sort: filters.sort });
  };

  return (
    <div className="mt-6 space-y-3">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (typing.current) clearTimeout(typing.current);
          go({ q: query.trim() });
          // Puts the phone's keyboard away.
          (document.activeElement as HTMLElement | null)?.blur();
        }}
        className="relative"
      >
        <label htmlFor="tx-search" className="sr-only">
          Search transactions
        </label>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/45"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          id="tx-search"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(e) => type(e.target.value)}
          placeholder="Search name or amount"
          className="field bg-none! pl-10! pr-3!"
        />
      </form>

      <div className="flex gap-2">
        <label htmlFor="tx-sort" className="sr-only">
          Sort by
        </label>
        <select
          id="tx-sort"
          value={filters.sort}
          onChange={(e) => go({ sort: e.target.value as TransactionSort })}
          className="field min-w-0 flex-1"
        >
          {(Object.keys(SORT_LABELS) as TransactionSort[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="tx-filters"
          className={`pressable flex shrink-0 items-center gap-2 rounded-[0.875rem] border px-4 text-base font-medium ${
            count ? "border-violet-400/50 bg-violet-500/15 text-violet-200" : "border-white/12 bg-surface-2 text-white/80"
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          Filters
          {count ? (
            <span className="rounded-full bg-violet-400 px-1.5 text-xs font-semibold leading-5 text-[#141828]">{count}</span>
          ) : null}
        </button>
      </div>

      {open ? (
        <div id="tx-filters" className="card space-y-4 p-4">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-white/70">Review</legend>
            <div className="grid grid-cols-3 gap-1 rounded-[0.875rem] bg-surface-2 p-1">
              {(Object.keys(STATUS_LABELS) as ReviewStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={filters.status === s}
                  onClick={() => go({ status: s })}
                  className={`pressable rounded-[0.65rem] px-2 py-2 text-sm font-medium ${
                    filters.status === s ? "bg-violet-500/25 text-violet-100" : "text-white/60"
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="tx-account" className="mb-1.5 block text-sm font-medium text-white/70">
                Account
              </label>
              <select id="tx-account" value={filters.account} onChange={(e) => go({ account: e.target.value })} className="field">
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tx-category" className="mb-1.5 block text-sm font-medium text-white/70">
                Category
              </label>
              <select id="tx-category" value={filters.category} onChange={(e) => go({ category: e.target.value })} className="field">
                <option value="">All categories</option>
                {groups.map((g) => (
                  <optgroup key={g.kind} label={KIND_LABELS[g.kind] ?? g.kind}>
                    {g.list.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name.trim()}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label htmlFor="tx-from" className="mb-1.5 block text-sm font-medium text-white/70">
                From
              </label>
              <input
                id="tx-from"
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => go({ from: e.target.value })}
                className="field bg-none! pr-3!"
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="tx-to" className="mb-1.5 block text-sm font-medium text-white/70">
                To
              </label>
              <input
                id="tx-to"
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => go({ to: e.target.value })}
                className="field bg-none! pr-3!"
              />
            </div>
          </div>
        </div>
      ) : null}

      {narrowed ? (
        <div className="flex items-center justify-between gap-3 px-1 text-sm">
          <p aria-live="polite" className="text-white/60">
            {pending ? "Searching…" : `${matches.toLocaleString("en-US")} ${matches === 1 ? "match" : "matches"}`}
          </p>
          <button type="button" onClick={clearAll} className="font-medium text-violet-300 underline-offset-2 hover:underline">
            Clear all
          </button>
        </div>
      ) : pending ? (
        <p aria-live="polite" className="px-1 text-sm text-white/60">
          Sorting…
        </p>
      ) : null}
    </div>
  );
}

import type { BudgetData, Transaction } from "./types";

// Search, sort and filter for the Transactions page. The choices live in the
// page address (?q=coffee&sort=largest&status=review…), so the signed-in page
// can narrow its database query and the demo can narrow its made-up rows the
// same way. Both end with applyTransactionFilters, so they show the same rows.

export type TransactionSort = "newest" | "oldest" | "largest" | "smallest" | "name";
export type ReviewStatus = "all" | "review" | "reviewed";

export type TransactionFilters = {
  q: string; // matches the name or the exact amount
  sort: TransactionSort;
  account: string; // account id, or "" for every account
  category: string; // category id, or "" for every category
  status: ReviewStatus;
  from: string; // YYYY-MM-DD or ""
  to: string; // YYYY-MM-DD or ""
};

export const DEFAULT_FILTERS: TransactionFilters = {
  q: "",
  sort: "newest",
  account: "",
  category: "",
  status: "all",
  from: "",
  to: "",
};

export const SORT_LABELS: Record<TransactionSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  largest: "Amount: largest first",
  smallest: "Amount: smallest first",
  name: "Name: A to Z",
};

const SORTS = Object.keys(SORT_LABELS) as TransactionSort[];
const STATUSES: ReviewStatus[] = ["all", "review", "reviewed"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

function get(params: Params, key: string): string {
  if (params instanceof URLSearchParams) return params.get(key) ?? "";
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function readFilters(params: Params): TransactionFilters {
  const sort = get(params, "sort") as TransactionSort;
  const status = get(params, "status") as ReviewStatus;
  const from = get(params, "from");
  const to = get(params, "to");
  return {
    q: get(params, "q").trim().slice(0, 100),
    sort: SORTS.includes(sort) ? sort : "newest",
    account: get(params, "account").slice(0, 100),
    category: get(params, "category").slice(0, 100),
    status: STATUSES.includes(status) ? status : "all",
    from: DAY.test(from) ? from : "",
    to: DAY.test(to) ? to : "",
  };
}

// The page address for these choices; anything left at its default is left out.
export function filtersToSearch(f: TransactionFilters): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(DEFAULT_FILTERS) as (keyof TransactionFilters)[]) {
    if (f[key] && f[key] !== DEFAULT_FILTERS[key]) params.set(key, f[key]);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

// How many filters (not counting search and sort) are switched on.
export function activeFilterCount(f: TransactionFilters): number {
  return [f.account, f.category, f.status !== "all", f.from, f.to].filter(Boolean).length;
}

// True when the list shows less than everything, or in another order.
export function isNarrowed(f: TransactionFilters): boolean {
  return Boolean(f.q) || f.sort !== "newest" || activeFilterCount(f) > 0;
}

// The amount a search names, like "12.50", "$12.50" or "-12.5", or null.
export function searchAmount(q: string): number | null {
  const text = q.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(text) && !/^-?\.\d{1,2}$/.test(text)) return null;
  return Math.abs(Number(text));
}

function sameCents(a: number, b: number) {
  return Math.round(Math.abs(a) * 100) === Math.round(b * 100);
}

export function matchesSearch(t: Transaction, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (t.description.toLowerCase().includes(needle)) return true;
  if (t.merchant?.toLowerCase().includes(needle)) return true;
  const amount = searchAmount(q);
  return amount !== null && sameCents(t.amount, amount);
}

export function applyTransactionFilters(
  data: Pick<BudgetData, "accounts">,
  transactions: Transaction[],
  f: TransactionFilters,
): Transaction[] {
  const accountIds = new Set(data.accounts.map((a) => a.id));
  const list = transactions.filter((t) => {
    if (!accountIds.has(t.accountId)) return false;
    if (f.account && t.accountId !== f.account) return false;
    if (f.category && t.categoryId !== f.category) return false;
    if (f.status === "review" && t.reviewed !== false) return false;
    if (f.status === "reviewed" && t.reviewed === false) return false;
    if (f.from && t.postedOn < f.from) return false;
    if (f.to && t.postedOn > f.to) return false;
    return matchesSearch(t, f.q);
  });

  // Ties keep the newest first, then the order they came in.
  const order = new Map(list.map((t, i) => [t.id, i]));
  const byDate = (a: Transaction, b: Transaction) =>
    b.postedOn.localeCompare(a.postedOn) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  const compare: Record<TransactionSort, (a: Transaction, b: Transaction) => number> = {
    newest: byDate,
    oldest: (a, b) => a.postedOn.localeCompare(b.postedOn) || (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0),
    largest: (a, b) => Math.abs(b.amount) - Math.abs(a.amount) || byDate(a, b),
    smallest: (a, b) => Math.abs(a.amount) - Math.abs(b.amount) || byDate(a, b),
    name: (a, b) =>
      a.description.localeCompare(b.description, "en", { sensitivity: "base" }) || byDate(a, b),
  };
  return list.sort(compare[f.sort]);
}

// A search made safe for a PostgREST or() filter: the LIKE wildcards and the
// characters or() treats specially each become "_", which matches any one
// character, so the database finds every row the search above would.
export function likePattern(q: string): string {
  return `%${q.replace(/[%_*\\"]/g, "_")}%`;
}

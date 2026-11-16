"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteCategory, saveCategory, type CategoryFormState } from "./actions";

export type CategoryItemData = {
  id: string;
  name: string;
  kind: string;
  color: string | null;
  budget: number | null;
  plaidCategories: string[];
};

export type BankCategory = { code: string; label: string };

const input = "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20";
const primary = "rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-emerald-500";
const plain = "rounded-lg border border-black/15 px-3 py-2 text-sm disabled:opacity-50 dark:border-white/20";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const kindLabel: Record<string, string> = { expense: "Spending", income: "Income", transfer: "Transfer (not counted)" };

function Message({ state }: { state: CategoryFormState }) {
  if (!state) return null;
  return (
    <p className={`text-xs ${state.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>{state.message}</p>
  );
}

function CategoryFields({ item, bankCategories }: { item?: CategoryItemData; bankCategories: BankCategory[] }) {
  const chosen = new Set(item?.plaidCategories ?? []);
  const [kind, setKind] = useState(item?.kind ?? "expense");
  return (
    <div className="grid gap-3">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm sm:col-span-1">
          <span className="mb-1 block text-xs text-black/60 dark:text-white/60">Name</span>
          <input name="name" defaultValue={item?.name ?? ""} required maxLength={60} className={input} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-black/60 dark:text-white/60">Type</span>
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={input}>
            <option value="expense">Spending</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer (not counted)</option>
          </select>
        </label>
        {kind === "expense" ? (
          <label className="text-sm">
            <span className="mb-1 block text-xs text-black/60 dark:text-white/60">Monthly budget</span>
            <input name="budget" inputMode="decimal" placeholder="No budget" defaultValue={item?.budget ?? ""} className={input} />
          </label>
        ) : (
          <p className="self-end pb-2 text-xs text-black/60 dark:text-white/60">
            {kind === "transfer"
              ? "Money moving between your own accounts. It stays off your budget and isn't counted as spending."
              : "Money coming in. It shows as income, not on your budget."}
          </p>
        )}
      </div>
      {bankCategories.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-black/60 dark:text-white/60">
            Bank categories that go here ({chosen.size})
          </summary>
          <div className="mt-2 grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
            {bankCategories.map((b) => (
              <label key={b.code} className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="plaid" value={b.code} defaultChecked={chosen.has(b.code)} />
                {b.label}
              </label>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function AddCategoryForm({ bankCategories }: { bankCategories: BankCategory[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveCategory, null);
  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setOpen(true)} className={primary}>
          + New category
        </button>
        <Message state={state} />
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/15"
    >
      <CategoryFields bankCategories={bankCategories} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Adding…" : "Add category"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={plain}>
          Close
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function CategoryItem({ item, bankCategories }: { item: CategoryItemData; bankCategories: BankCategory[] }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [state, action, pending] = useActionState(saveCategory, null);
  const [deleteState, setDeleteState] = useState<CategoryFormState>(null);
  const [deleting, startDelete] = useTransition();
  const labels = new Map(bankCategories.map((b) => [b.code, b.label]));

  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color ?? "#6b7280" }} />
          <div className="min-w-0">
            <p className="truncate font-medium">{item.name}</p>
            <p className="truncate text-xs text-black/50 dark:text-white/50">
              {kindLabel[item.kind] ?? item.kind}
              {item.plaidCategories.length
                ? ` · ${item.plaidCategories.map((c) => labels.get(c) ?? c).join(", ")}`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="tabular-nums text-black/60 dark:text-white/60">
            {item.kind !== "expense" ? "" : item.budget !== null ? `${money.format(item.budget)}/mo` : "No budget"}
          </span>
          {mode === "view" ? (
            <>
              <button type="button" onClick={() => setMode("edit")} className="rounded-lg border border-black/15 px-2 py-1 text-xs dark:border-white/20">
                Edit
              </button>
              <button
                type="button"
                onClick={() => setMode("confirm")}
                className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-500/40 dark:text-red-300"
              >
                Delete
              </button>
            </>
          ) : null}
        </div>
      </div>

      {mode === "confirm" ? (
        <div className="mt-3 rounded-xl bg-red-50 p-3 text-red-900 dark:bg-red-500/10 dark:text-red-200">
          <p className="font-medium">Do you really want to delete {item.name}?</p>
          <p className="mt-1 text-xs">Its budget goes too. Its transactions stay, sorted by your bank&apos;s category instead.</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() =>
                startDelete(async () => {
                  const result = await deleteCategory(item.id);
                  setDeleteState(result);
                  if (!result?.ok) setMode("view");
                })
              }
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" onClick={() => setMode("view")} className={plain}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {mode === "edit" ? (
        <form action={action} className="mt-3 grid gap-3 rounded-xl border border-black/10 p-3 dark:border-white/15">
          <CategoryFields item={item} bankCategories={bankCategories} />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className={primary}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setMode("view")} className={plain}>
              Close
            </button>
            <Message state={state} />
          </div>
        </form>
      ) : null}
      {mode === "view" ? <Message state={deleteState} /> : null}
    </li>
  );
}

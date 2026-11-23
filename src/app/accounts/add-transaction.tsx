"use client";

import { useState, useTransition } from "react";
import type { ManualInput } from "@/lib/budget/manual-transaction";
import type { PickCategory } from "@/lib/budget/types";
import { CategoryOptions } from "../category-options";
import { StatementUpload, type UploadHandlers } from "../upload/statement-upload";
import { addTransaction, type AddResult } from "./actions";

// The Add transaction button inside an account: type one in, or upload
// files and screenshots for this account. Linked banks fill in by
// themselves, so they only take typed ones. The demo passes `onAdd` and the
// upload handlers to keep everything in the page.

const field = "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20 dark:bg-neutral-900";
const primary = "btn-primary pressable rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50";
const plain = "rounded-lg border border-black/15 px-4 py-2 text-sm disabled:opacity-50 dark:border-white/20";

export function AddTransaction({
  account,
  own,
  categories,
  today,
  base = "",
  onAdd,
  upload,
}: {
  account: { id: string; name: string; type: string; mask: string | null; institution: string | null };
  own: boolean;
  categories: PickCategory[];
  today: string;
  base?: string;
  onAdd?: (accountId: string, input: ManualInput) => Promise<AddResult>;
  upload?: UploadHandlers & Pick<React.ComponentProps<typeof StatementUpload>, "sample" | "sampleScreenshot">;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"type" | "upload">("type");
  const blank: ManualInput = { postedOn: today, description: "", amount: "", direction: "out", categoryId: "" };
  const [form, setForm] = useState<ManualInput>(blank);
  const [result, setResult] = useState<AddResult | null>(null);
  const [saving, start] = useTransition();

  if (!open) {
    return (
      <div className="mt-4">
        <button type="button" onClick={() => setOpen(true)} className={primary}>
          + Add transaction
        </button>
        {result?.ok ? <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{result.message}</p> : null}
      </div>
    );
  }

  const save = () =>
    start(async () => {
      const r = await (onAdd ?? addTransaction)(account.id, form);
      setResult(r);
      if (r.ok) {
        setForm({ ...blank, postedOn: form.postedOn, direction: form.direction });
        setOpen(false);
      }
    });

  const tab = (id: "type" | "upload", label: string) => (
    <button
      type="button"
      onClick={() => setMode(id)}
      aria-pressed={mode === id}
      className={`rounded-full px-4 py-1.5 text-sm font-medium ${
        mode === id ? "bg-emerald-600 text-white" : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="mt-4 rounded-2xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">Add to {account.name}</h2>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setResult(null);
          }}
          className="text-sm text-black/60 dark:text-white/60"
        >
          Close
        </button>
      </div>

      {own ? (
        <div className="mt-3 flex gap-2">
          {tab("type", "Type it in")}
          {tab("upload", "Upload files")}
        </div>
      ) : (
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          {account.institution ?? "Your bank"} adds its transactions by itself, so add one here only if it&apos;s missing.
        </p>
      )}

      {own && mode === "upload" ? (
        <StatementUpload
          accounts={[{ id: account.id, name: account.name, type: account.type, mask: account.mask }]}
          initialAccountId={account.id}
          base={base}
          fixedAccount
          {...upload}
        />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-xs text-black/60 dark:text-white/60">What it was</span>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Corner Store"
              maxLength={200}
              required
              className={field}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-black/60 dark:text-white/60">Amount</span>
            <input
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              inputMode="decimal"
              placeholder="12.50"
              required
              className={field}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-black/60 dark:text-white/60">Date</span>
            <input
              type="date"
              value={form.postedOn}
              max={today}
              onChange={(e) => setForm({ ...form, postedOn: e.target.value })}
              required
              className={field}
            />
          </label>
          <fieldset className="text-sm">
            <legend className="mb-1 block text-xs text-black/60 dark:text-white/60">Money</legend>
            <div className="flex gap-4 py-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`direction-${account.id}`}
                  checked={form.direction === "out"}
                  onChange={() => setForm({ ...form, direction: "out" })}
                />
                Out
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`direction-${account.id}`}
                  checked={form.direction === "in"}
                  onChange={() => setForm({ ...form, direction: "in" })}
                />
                In
              </label>
            </div>
          </fieldset>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-black/60 dark:text-white/60">Category</span>
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className={field}>
              <option value="">No category yet</option>
              <CategoryOptions categories={categories} />
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="submit" disabled={saving} className={primary}>
              {saving ? "Adding…" : "Add transaction"}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={saving} className={plain}>
              Cancel
            </button>
          </div>
          {result && !result.ok ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400 sm:col-span-2">
              {result.message}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}

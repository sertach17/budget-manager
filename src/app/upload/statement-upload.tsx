"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { plaidCategoryLabel } from "@/lib/budget/plaid-names";
import { parseStatement, type ParsedStatement, type StatementRow } from "@/lib/statements/parse";
import { checkStatement, saveStatement, type CheckResult, type SaveResult } from "./actions";

// Upload a statement file to one of your own accounts. The file is read
// here in the browser; you see what's new before anything is saved.

export type UploadAccount = { id: string; name: string; type: string; mask: string | null };

type Handlers = {
  onCheck?: (accountId: string, rows: StatementRow[]) => Promise<CheckResult>;
  onSave?: typeof saveStatement;
};

type Preview = {
  fileName: string;
  text: string;
  parsed: ParsedStatement;
  already: boolean[];
};

const input = "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20 dark:bg-neutral-900";
const primary = "rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-emerald-500";
const plain = "rounded-lg border border-black/15 px-3 py-2 text-sm disabled:opacity-50 dark:border-white/20";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const MAX_BYTES = 5 * 1024 * 1024;
const SHOWN = 100;

const FORMAT_LABEL: Record<string, string> = {
  "apple-card": "Apple Card export",
  csv: "CSV file",
  ofx: "OFX / QFX file",
};

const day = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function StatementUpload({
  accounts,
  initialAccountId,
  base = "",
  sample,
  onCheck,
  onSave,
}: {
  accounts: UploadAccount[];
  initialAccountId?: string;
  base?: string;
  // The demo offers a made-up file so visitors can try it without one.
  sample?: { fileName: string; text: string };
} & Handlers) {
  const [accountId, setAccountId] = useState(
    accounts.some((a) => a.id === initialAccountId) ? initialAccountId! : (accounts[0]?.id ?? ""),
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toReview, setToReview] = useState(true);
  const [saved, setSaved] = useState<SaveResult | null>(null);
  const [pending, start] = useTransition();
  const account = accounts.find((a) => a.id === accountId);

  if (!accounts.length) {
    return (
      <p className="mt-6 rounded-xl border border-dashed border-black/15 p-6 text-sm dark:border-white/20">
        Add an account for it first, like Apple Card, under Your own accounts on the{" "}
        <Link href={`${base}/banks`} className="font-medium underline">
          Banks page
        </Link>
        .
      </p>
    );
  }

  const read = (fileName: string, text: string, forAccount: string, flip?: boolean) =>
    start(async () => {
      setError(null);
      setSaved(null);
      let parsed: ParsedStatement;
      try {
        const type = accounts.find((a) => a.id === forAccount)?.type;
        parsed = parseStatement(fileName, text, { flip, accountType: type });
      } catch (e) {
        setPreview(null);
        setError(e instanceof Error ? e.message : "This file couldn't be read.");
        return;
      }
      const checked = await (onCheck ?? checkStatement)(forAccount, parsed.rows);
      if (!checked.ok) {
        setPreview(null);
        setError(checked.message);
        return;
      }
      setPreview({ fileName, text, parsed, already: checked.already });
    });

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setPreview(null);
      setError("That file is bigger than 5 MB. Download a shorter date range.");
      return;
    }
    read(file.name, await file.text(), accountId);
  };

  const fresh = preview ? preview.parsed.rows.filter((_, i) => !preview.already[i]) : [];
  const alreadyCount = preview ? preview.already.filter(Boolean).length : 0;
  const moneyOut = fresh.filter((r) => r.amount < 0).reduce((n, r) => n - r.amount, 0);
  const moneyIn = fresh.filter((r) => r.amount > 0).reduce((n, r) => n + r.amount, 0);

  const save = () =>
    start(async () => {
      if (!preview) return;
      // Send every row; the server skips the ones you already have, so the
      // count for same-day twins stays right.
      const r = await (onSave ?? saveStatement)({
        accountId,
        fileName: preview.fileName,
        format: preview.parsed.format,
        rows: preview.parsed.rows,
        toReview,
      });
      setSaved(r);
      if (r.ok) setPreview(null);
    });

  return (
    <div className="mt-6 grid gap-6">
      <div className="grid gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/15">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-black/60 dark:text-white/60">Account</span>
          <select
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              if (preview) read(preview.fileName, preview.text, e.target.value);
            }}
            className={input}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.mask ? ` ···${a.mask}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-black/60 dark:text-white/60">Statement file (CSV, OFX, QFX or QBO)</span>
          <input
            type="file"
            accept=".csv,.ofx,.qfx,.qbo,text/csv"
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white dark:file:bg-emerald-500"
          />
        </label>
        {sample ? (
          <button type="button" onClick={() => read(sample.fileName, sample.text, accountId)} disabled={pending} className={`justify-self-start ${plain}`}>
            Try a made-up sample file
          </button>
        ) : null}
        <p className="text-xs text-black/50 dark:text-white/50">
          On Apple Card: Wallet app → Apple Card → Card Balance → pick a monthly statement → Export Transactions → CSV. The file is read on
          this device, and nothing is saved until you tap Save.
        </p>
        {pending && !preview ? <p className="text-sm">Reading…</p> : null}
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {saved ? (
          <p className={`text-sm ${saved.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>
            {saved.message}{" "}
            {saved.ok && account ? (
              <Link href={`${base}/accounts/${account.id}`} className="font-medium underline">
                See {account.name}
              </Link>
            ) : null}
          </p>
        ) : null}
      </div>

      {preview ? (
        <section className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
          <p className="font-medium">
            {fresh.length} new {fresh.length === 1 ? "transaction" : "transactions"}
            {alreadyCount ? `, ${alreadyCount} you already have` : ""}
          </p>
          <p className="text-xs text-black/50 dark:text-white/50">
            {FORMAT_LABEL[preview.parsed.format]} · {preview.fileName}
            {preview.parsed.skipped ? ` · ${preview.parsed.skipped} lines couldn't be read and are left out` : ""}
          </p>
          {fresh.length ? (
            <p className="mt-2 text-sm">
              {money.format(moneyOut)} out · {money.format(moneyIn)} in
            </p>
          ) : null}

          {preview.parsed.flipped !== null ? (
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={preview.parsed.flipped}
                onChange={(e) => read(preview.fileName, preview.text, accountId, e.target.checked)}
                className="mt-1"
              />
              <span>
                Purchases show as positive numbers in this file
                <span className="block text-xs text-black/50 dark:text-white/50">
                  Check the list: purchases should be red money out. Tick or untick this if they aren&apos;t.
                </span>
              </span>
            </label>
          ) : null}

          {fresh.length ? (
            <>
              <ul className="mt-4 max-h-96 divide-y divide-black/10 overflow-y-auto text-sm dark:divide-white/10">
                {fresh.slice(0, SHOWN).map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate">{r.merchant || r.description}</p>
                      <p className="truncate text-xs text-black/50 dark:text-white/50">
                        {day(r.postedOn)}
                        {r.category ? ` · ${plaidCategoryLabel(r.category)}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 tabular-nums ${r.amount < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-300"}`}>
                      {money.format(r.amount)}
                    </span>
                  </li>
                ))}
              </ul>
              {fresh.length > SHOWN ? (
                <p className="mt-2 text-xs text-black/50 dark:text-white/50">And {fresh.length - SHOWN} more.</p>
              ) : null}
              <label className="mt-4 flex items-start gap-2 text-sm">
                <input type="checkbox" checked={toReview} onChange={(e) => setToReview(e.target.checked)} className="mt-1" />
                <span>
                  Put them under Pending to review
                  <span className="block text-xs text-black/50 dark:text-white/50">Untick to mark them all reviewed now.</span>
                </span>
              </label>
              <div className="mt-4 flex items-center gap-3">
                <button type="button" onClick={save} disabled={pending} className={primary}>
                  {pending ? "Saving…" : `Save ${fresh.length} to ${account?.name ?? "the account"}`}
                </button>
                <button type="button" onClick={() => setPreview(null)} disabled={pending} className={plain}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm">You already have everything in this file.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

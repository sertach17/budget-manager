"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { plaidCategoryLabel } from "@/lib/budget/plaid-names";
import { parseStatement, type ParsedStatement, type StatementRow } from "@/lib/statements/parse";
import type { ScreenshotResult } from "@/lib/statements/screenshot";
import { checkStatement, readScreenshot, saveStatement, type CheckResult, type SaveResult } from "./actions";

// Upload a statement file or a screenshot to one of your own accounts. A
// file is read here in the browser; a screenshot is shrunk here, then read by
// Anthropic's AI. Either way you see what's new before anything is saved.

export type UploadAccount = { id: string; name: string; type: string; mask: string | null };

type Handlers = {
  onCheck?: (accountId: string, rows: StatementRow[]) => Promise<CheckResult>;
  onSave?: typeof saveStatement;
  onReadScreenshot?: (accountId: string, dataUrl: string) => Promise<ScreenshotResult>;
};

type Preview = {
  fileName: string;
  text: string; // the file's text; empty for a screenshot
  parsed: ParsedStatement;
  already: boolean[];
  note?: string;
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
  screenshot: "Screenshot",
};

// Phone screenshots are big; a picture 1568 pixels on its long side is
// plenty to read and keeps the upload small.
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

const day = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function StatementUpload({
  accounts,
  initialAccountId,
  base = "",
  sample,
  sampleScreenshot,
  onCheck,
  onSave,
  onReadScreenshot,
}: {
  accounts: UploadAccount[];
  initialAccountId?: string;
  base?: string;
  // The demo offers a made-up file so visitors can try it without one.
  sample?: { fileName: string; text: string };
  // The demo's made-up screenshot, already "read".
  sampleScreenshot?: StatementRow[];
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

  // Mark the rows you already have, then show them.
  const show = async (fileName: string, text: string, parsed: ParsedStatement, forAccount: string, note?: string) => {
    const checked = await (onCheck ?? checkStatement)(forAccount, parsed.rows);
    if (!checked.ok) {
      setPreview(null);
      setError(checked.message);
      return;
    }
    setPreview({ fileName, text, parsed, already: checked.already, note });
  };

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
      await show(fileName, text, parsed, forAccount);
    });

  const showScreenshot = (fileName: string, result: ScreenshotResult, forAccount: string) => {
    if (!result.ok) {
      setPreview(null);
      setError(result.message);
      return;
    }
    const note = result.pendingLeftOut
      ? result.pendingLeftOut === 1
        ? "1 pending one is left out until it posts."
        : `${result.pendingLeftOut} pending ones are left out until they post.`
      : undefined;
    return show(fileName, "", { format: "screenshot", rows: result.rows, skipped: 0, flipped: null }, forAccount, note);
  };

  const readPicture = (file: File, forAccount: string) =>
    start(async () => {
      setError(null);
      setSaved(null);
      let dataUrl: string;
      try {
        dataUrl = await shrink(file);
      } catch {
        setPreview(null);
        setError("This picture couldn't be opened. Use a PNG or JPEG screenshot.");
        return;
      }
      const result = await (onReadScreenshot ?? readScreenshot)(forAccount, dataUrl);
      await showScreenshot(file.name, result, forAccount);
    });

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.type.startsWith("image/")) {
      if (file.size > 20 * 1024 * 1024) {
        setPreview(null);
        setError("That picture is bigger than 20 MB. Try a screenshot instead.");
        return;
      }
      readPicture(file, accountId);
      return;
    }
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
              const next = e.target.value;
              setAccountId(next);
              if (!preview) return;
              // A screenshot isn't read again; its rows are just checked
              // against the other account.
              if (preview.parsed.format === "screenshot") {
                const { fileName, parsed, note } = preview;
                start(() => show(fileName, "", parsed, next, note));
              } else read(preview.fileName, preview.text, next);
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
          <span className="mb-1 block text-xs text-black/60 dark:text-white/60">
            Statement file (CSV, OFX, QFX or QBO) or a screenshot of transactions
          </span>
          <input
            type="file"
            accept=".csv,.ofx,.qfx,.qbo,text/csv,image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white dark:file:bg-emerald-500"
          />
        </label>
        {sample || sampleScreenshot ? (
          <div className="flex flex-wrap gap-2">
            {sample ? (
              <button type="button" onClick={() => read(sample.fileName, sample.text, accountId)} disabled={pending} className={plain}>
                Try a made-up sample file
              </button>
            ) : null}
            {sampleScreenshot ? (
              <button
                type="button"
                onClick={() =>
                  start(async () => {
                    setError(null);
                    setSaved(null);
                    await showScreenshot("Sample screenshot", { ok: true, rows: sampleScreenshot, pendingLeftOut: 1 }, accountId);
                  })
                }
                disabled={pending}
                className={plain}
              >
                Try a made-up sample screenshot
              </button>
            ) : null}
          </div>
        ) : null}
        <p className="text-xs text-black/50 dark:text-white/50">
          On Apple Card: Wallet app → Apple Card → Card Balance → pick a monthly statement → Export Transactions → CSV. A statement
          file is read on this device. A screenshot is sent to Anthropic&apos;s AI to read the transactions in it, about a tenth of a
          cent each. Nothing is saved until you tap Save.
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
          {preview.note ? <p className="mt-1 text-xs text-black/50 dark:text-white/50">{preview.note}</p> : null}
          {preview.parsed.format === "screenshot" ? (
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">Read by AI: check the dates and amounts before you save.</p>
          ) : null}
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

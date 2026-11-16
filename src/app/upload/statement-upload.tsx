"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { plaidCategoryLabel } from "@/lib/budget/plaid-names";
import { mergeStatements, parseStatement, type ParsedStatement, type StatementRow } from "@/lib/statements/parse";
import type { ScreenshotResult } from "@/lib/statements/screenshot";
import { checkStatement, readScreenshot, saveStatement, type CheckResult, type SaveResult } from "./actions";

// Upload statement files or screenshots to one of your own accounts, one or
// several at a time. A file is read here in the browser; a screenshot is
// shrunk here, then read by Anthropic's AI. Either way you see what's new
// before anything is saved.

export type UploadAccount = { id: string; name: string; type: string; mask: string | null };

export type UploadHandlers = {
  onCheck?: (accountId: string, rows: StatementRow[]) => Promise<CheckResult>;
  onSave?: typeof saveStatement;
  onReadScreenshot?: (accountId: string, dataUrl: string) => Promise<ScreenshotResult>;
};

// One file or screenshot you picked. A file keeps its text so it can be read
// again for another account or the other sign.
type Source = {
  fileName: string;
  text: string; // empty for a screenshot
  parsed: ParsedStatement;
  pendingLeftOut: number;
};

type Preview = {
  sources: Source[];
  rows: StatementRow[]; // every file's rows, each transaction once
  overlap: number; // rows that showed up in more than one file
  already: boolean[];
};

const input = "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20 dark:bg-neutral-900";
const primary = "rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-emerald-500";
const plain = "rounded-lg border border-black/15 px-3 py-2 text-sm disabled:opacity-50 dark:border-white/20";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const MAX_BYTES = 5 * 1024 * 1024;
const SHOWN = 100;
const MAX_FILES = 10;

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
  fixedAccount = false,
}: {
  accounts: UploadAccount[];
  initialAccountId?: string;
  base?: string;
  // The demo offers a made-up file so visitors can try it without one.
  sample?: { fileName: string; text: string };
  // The demo's made-up screenshot, already "read".
  sampleScreenshot?: StatementRow[];
  // Inside an account's page: the account is already chosen.
  fixedAccount?: boolean;
} & UploadHandlers) {
  const [accountId, setAccountId] = useState(
    accounts.some((a) => a.id === initialAccountId) ? initialAccountId! : (accounts[0]?.id ?? ""),
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toReview, setToReview] = useState(true);
  const [saved, setSaved] = useState<SaveResult | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
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

  const typeOf = (forAccount: string) => accounts.find((a) => a.id === forAccount)?.type;

  // Put the files together, mark the rows you already have, then show them.
  const show = async (sources: Source[], forAccount: string) => {
    const { rows, overlap } = mergeStatements(
      forAccount,
      sources.map((s) => s.parsed.rows),
    );
    const checked = rows.length ? await (onCheck ?? checkStatement)(forAccount, rows) : { ok: true as const, already: [] };
    if (!checked.ok) {
      setPreview(null);
      setError(checked.message);
      return;
    }
    setPreview({ sources, rows, overlap, already: checked.already });
  };

  // A statement file's text, read for this account. Throws a message if it
  // can't be read.
  const parseFile = (fileName: string, text: string, forAccount: string, flip?: boolean): Source => ({
    fileName,
    text,
    parsed: parseStatement(fileName, text, { flip, accountType: typeOf(forAccount) }),
    pendingLeftOut: 0,
  });

  // Files are read again for another account (the sign can depend on the
  // kind of account); screenshots aren't read again, only checked.
  const reread = (sources: Source[], forAccount: string) =>
    start(async () => {
      setError(null);
      try {
        const next = sources.map((s) =>
          s.parsed.format === "screenshot" ? s : parseFile(s.fileName, s.text, forAccount, s.parsed.flipped ?? undefined),
        );
        await show(next, forAccount);
      } catch (e) {
        setPreview(null);
        setError(e instanceof Error ? e.message : "This file couldn't be read.");
      }
    });

  const flip = (index: number, flipped: boolean) =>
    start(async () => {
      if (!preview) return;
      setError(null);
      try {
        const s = preview.sources[index];
        const next = preview.sources.map((x, i) => (i === index ? parseFile(s.fileName, s.text, accountId, flipped) : x));
        await show(next, accountId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "This file couldn't be read.");
      }
    });

  // Read every file you picked, one after another, then show them together.
  // A file that can't be read is named; the rest still show.
  const pickFiles = (picked: File[]) => {
    if (!picked.length) return;
    if (picked.length > MAX_FILES) {
      setPreview(null);
      setError(`Pick up to ${MAX_FILES} files at a time.`);
      return;
    }
    const forAccount = accountId;
    start(async () => {
      setError(null);
      setSaved(null);
      setPreview(null);
      const sources: Source[] = [];
      const problems: string[] = [];
      for (let i = 0; i < picked.length; i++) {
        const file = picked[i];
        setProgress(picked.length > 1 ? `Reading ${i + 1} of ${picked.length}…` : "Reading…");
        if (file.type.startsWith("image/")) {
          if (file.size > 20 * 1024 * 1024) {
            problems.push(`${file.name} is bigger than 20 MB.`);
            continue;
          }
          let dataUrl: string;
          try {
            dataUrl = await shrink(file);
          } catch {
            problems.push(`${file.name} couldn't be opened. Use a PNG or JPEG screenshot.`);
            continue;
          }
          const result = await (onReadScreenshot ?? readScreenshot)(forAccount, dataUrl);
          if (!result.ok) {
            problems.push(picked.length > 1 ? `${file.name}: ${result.message}` : result.message);
            continue;
          }
          sources.push({
            fileName: file.name,
            text: "",
            parsed: { format: "screenshot", rows: result.rows, skipped: 0, flipped: null },
            pendingLeftOut: result.pendingLeftOut,
          });
          continue;
        }
        if (file.size > MAX_BYTES) {
          problems.push(`${file.name} is bigger than 5 MB. Download a shorter date range.`);
          continue;
        }
        try {
          sources.push(parseFile(file.name, await file.text(), forAccount));
        } catch (e) {
          const why = e instanceof Error ? e.message : "It couldn't be read.";
          problems.push(picked.length > 1 ? `${file.name}: ${why}` : why);
        }
      }
      setProgress(null);
      if (problems.length) setError(problems.join(" "));
      if (sources.length) await show(sources, forAccount);
    });
  };

  const sampleFile = (sample: { fileName: string; text: string }) =>
    start(async () => {
      setError(null);
      setSaved(null);
      try {
        await show([parseFile(sample.fileName, sample.text, accountId)], accountId);
      } catch (e) {
        setPreview(null);
        setError(e instanceof Error ? e.message : "This file couldn't be read.");
      }
    });

  const fresh = preview ? preview.rows.filter((_, i) => !preview.already[i]) : [];
  const pendingLeftOut = preview ? preview.sources.reduce((n, s) => n + s.pendingLeftOut, 0) : 0;
  const anyScreenshot = preview?.sources.some((s) => s.parsed.format === "screenshot") ?? false;
  const skipped = preview ? preview.sources.reduce((n, s) => n + s.parsed.skipped, 0) : 0;
  const alreadyCount = preview ? preview.already.filter(Boolean).length : 0;
  const moneyOut = fresh.filter((r) => r.amount < 0).reduce((n, r) => n - r.amount, 0);
  const moneyIn = fresh.filter((r) => r.amount > 0).reduce((n, r) => n + r.amount, 0);

  const save = () =>
    start(async () => {
      if (!preview) return;
      // Send every row; the server skips the ones you already have, so the
      // count for same-day twins stays right.
      const [first, ...rest] = preview.sources;
      const r = await (onSave ?? saveStatement)({
        accountId,
        fileName: rest.length ? `${first.fileName} and ${rest.length} more` : first.fileName,
        format: first.parsed.format,
        rows: preview.rows,
        toReview,
      });
      setSaved(r);
      if (r.ok) setPreview(null);
    });

  return (
    <div className="mt-6 grid gap-6">
      <div className="grid gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/15">
        {fixedAccount ? null : (
          <label className="text-sm">
            <span className="mb-1 block text-xs text-black/60 dark:text-white/60">Account</span>
            <select
              value={accountId}
              onChange={(e) => {
                const next = e.target.value;
                setAccountId(next);
                if (preview) reread(preview.sources, next);
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
        )}
        <label className="text-sm">
          <span className="mb-1 block text-xs text-black/60 dark:text-white/60">
            Statement files (CSV, OFX, QFX or QBO) or screenshots of transactions, up to {MAX_FILES} at a time
          </span>
          <input
            type="file"
            multiple
            accept=".csv,.ofx,.qfx,.qbo,text/csv,image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              pickFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white dark:file:bg-emerald-500"
          />
        </label>
        {sample || sampleScreenshot ? (
          <div className="flex flex-wrap gap-2">
            {sample ? (
              <button type="button" onClick={() => sampleFile(sample)} disabled={pending} className={plain}>
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
                    await show(
                      [
                        {
                          fileName: "Sample screenshot",
                          text: "",
                          parsed: { format: "screenshot", rows: sampleScreenshot, skipped: 0, flipped: null },
                          pendingLeftOut: 1,
                        },
                      ],
                      accountId,
                    );
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
        {pending && !preview ? <p className="text-sm">{progress ?? "Reading…"}</p> : null}
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {saved ? (
          <p className={`text-sm ${saved.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>
            {saved.message}{" "}
            {saved.ok && account && !fixedAccount ? (
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
            {preview.sources.length === 1
              ? `${FORMAT_LABEL[preview.sources[0].parsed.format]} · ${preview.sources[0].fileName}`
              : `From ${preview.sources.length} files: ${preview.sources.map((s) => s.fileName).join(", ")}`}
            {skipped ? ` · ${skipped} lines couldn't be read and are left out` : ""}
          </p>
          {preview.overlap ? (
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              {preview.overlap === 1
                ? "1 transaction showed up in more than one file and is counted once."
                : `${preview.overlap} transactions showed up in more than one file and are counted once.`}
            </p>
          ) : null}
          {pendingLeftOut ? (
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              {pendingLeftOut === 1
                ? "1 pending one is left out until it posts."
                : `${pendingLeftOut} pending ones are left out until they post.`}
            </p>
          ) : null}
          {anyScreenshot ? (
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">Read by AI: check the dates and amounts before you save.</p>
          ) : null}
          {fresh.length ? (
            <p className="mt-2 text-sm">
              {money.format(moneyOut)} out · {money.format(moneyIn)} in
            </p>
          ) : null}

          {preview.sources.map((source, index) =>
            source.parsed.flipped !== null ? (
              <label key={`${source.fileName}-${index}`} className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={source.parsed.flipped}
                  onChange={(e) => flip(index, e.target.checked)}
                  disabled={pending}
                  className="mt-1"
                />
                <span>
                  Purchases show as positive numbers in {preview.sources.length > 1 ? source.fileName : "this file"}
                  <span className="block text-xs text-black/50 dark:text-white/50">
                    Check the list: purchases should be red money out. Tick or untick this if they aren&apos;t.
                  </span>
                </span>
              </label>
            ) : null,
          )}

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
            <p className="mt-3 text-sm">
              You already have everything in {preview.sources.length > 1 ? "these files" : "this file"}.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}

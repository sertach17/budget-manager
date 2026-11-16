"use server";

import { revalidatePath } from "next/cache";
import { requireTwoFactorUser } from "@/lib/auth";
import { moveOwnBalance } from "@/lib/budget/apply-own-balance";
import { PLAID_CODE } from "@/lib/budget/plaid-names";
import { easternToday } from "@/lib/dates";
import { MAX_ROWS, readDate, statementFingerprints, type StatementFormat, type StatementRow } from "@/lib/statements/parse";
import { readTransactionScreenshot, type ScreenshotResult } from "@/lib/statements/screenshot";

// Saving a statement you uploaded to one of your own accounts. The file is
// read in your browser; only its rows come here, and they're checked again.

export type CheckResult = { ok: true; already: boolean[] } | { ok: false; message: string };
export type SaveResult = { ok: boolean; message: string; added?: number; already?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK = 500;

function cleanRows(rows: unknown): StatementRow[] | string {
  if (!Array.isArray(rows) || rows.length === 0) return "There's nothing to save.";
  if (rows.length > MAX_ROWS) return `A statement can have up to ${MAX_ROWS} transactions.`;
  const out: StatementRow[] = [];
  for (const raw of rows) {
    const r = raw as Partial<StatementRow>;
    const postedOn = typeof r.postedOn === "string" ? readDate(r.postedOn) : null;
    const amount = typeof r.amount === "number" && Number.isFinite(r.amount) ? Math.round(r.amount * 100) / 100 : null;
    const description = typeof r.description === "string" ? r.description.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    const merchant = typeof r.merchant === "string" ? r.merchant.replace(/\s+/g, " ").trim().slice(0, 200) || null : null;
    const category = typeof r.category === "string" && PLAID_CODE.test(r.category) ? r.category : null;
    if (!postedOn || amount === null || Math.abs(amount) >= 10_000_000 || !description) return "Some rows couldn't be read. Try the file again.";
    out.push({ postedOn, amount, description, merchant, category });
  }
  return out;
}

async function ownAccount(id: string) {
  const { supabase, userId } = await requireTwoFactorUser();
  if (!UUID.test(String(id))) return { supabase, userId, account: null };
  const { data } = await supabase.from("accounts").select("id, name, type").eq("id", id).in("source", ["manual", "upload"]).maybeSingle();
  return { supabase, userId, account: data };
}

// A screenshot, shrunk in the browser first, sent as a data URL. It's read
// by Anthropic's AI and not kept anywhere.
const IMAGE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;
const MAX_IMAGE_CHARS = 3_000_000; // about 2 MB of picture

export async function readScreenshot(accountId: string, dataUrl: string): Promise<ScreenshotResult> {
  const { account } = await ownAccount(accountId);
  if (!account) return { ok: false, message: "Pick one of your own accounts." };
  if (typeof dataUrl !== "string" || dataUrl.length > MAX_IMAGE_CHARS) return { ok: false, message: "That picture is too big. Try a smaller screenshot." };
  const match = IMAGE.exec(dataUrl);
  if (!match) return { ok: false, message: "That file isn't a picture this can read. Use a PNG or JPEG screenshot." };
  return readTransactionScreenshot({
    base64: match[2],
    mediaType: match[1] as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
    accountType: account.type,
    today: easternToday(),
  });
}

// Which rows you already have, so the preview can leave them out.
export async function checkStatement(accountId: string, rows: StatementRow[]): Promise<CheckResult> {
  const { supabase, account } = await ownAccount(accountId);
  if (!account) return { ok: false, message: "Pick one of your own accounts." };
  const clean = cleanRows(rows);
  if (typeof clean === "string") return { ok: false, message: clean };
  const prints = statementFingerprints(account.id, clean);
  // Everything this account already has in the statement's dates, a page at
  // a time.
  const dates = clean.map((r) => r.postedOn).sort();
  const have = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("transactions")
      .select("fingerprint")
      .eq("account_id", account.id)
      .gte("posted_on", dates[0])
      .lte("posted_on", dates[dates.length - 1])
      .order("id")
      .range(from, from + 999);
    if (error) return { ok: false, message: "Couldn't check for transactions you already have. Try again." };
    for (const row of data ?? []) have.add(row.fingerprint);
    if (!data || data.length < 1000) break;
  }
  return { ok: true, already: prints.map((p) => have.has(p)) };
}

export async function saveStatement(input: {
  accountId: string;
  fileName: string;
  format: StatementFormat;
  rows: StatementRow[];
  toReview: boolean;
}): Promise<SaveResult> {
  const { supabase, userId, account } = await ownAccount(input.accountId);
  if (!account) return { ok: false, message: "Pick one of your own accounts." };
  const clean = cleanRows(input.rows);
  if (typeof clean === "string") return { ok: false, message: clean };
  const fileName = String(input.fileName ?? "statement").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 200) || "statement";
  const kind = input.format === "ofx" ? "ofx" : input.format === "screenshot" ? "screenshot" : "csv";

  const { data: imported, error: importError } = await supabase
    .from("imports")
    .insert({ user_id: userId, account_id: account.id, file_name: fileName, kind, status: "pending" })
    .select("id")
    .single();
  if (importError || !imported) return { ok: false, message: "Couldn't start the upload. Try again." };

  const prints = statementFingerprints(account.id, clean);
  const reviewedAt = input.toReview ? null : new Date().toISOString();
  let added = 0;
  const addedRows: { postedOn: string; amount: number }[] = [];
  for (let i = 0; i < clean.length; i += CHUNK) {
    const chunk = clean.slice(i, i + CHUNK).map((r, j) => ({
      user_id: userId,
      account_id: account.id,
      import_id: imported.id,
      posted_on: r.postedOn,
      description: r.description,
      merchant: r.merchant,
      amount: r.amount,
      pending: false,
      source: "upload",
      plaid_category: r.category,
      fingerprint: prints[i + j],
      reviewed_at: reviewedAt,
    }));
    // Rows you already have are skipped, not changed.
    const { data, error } = await supabase
      .from("transactions")
      .upsert(chunk, { onConflict: "user_id,fingerprint", ignoreDuplicates: true })
      .select("id, posted_on, amount");
    if (error) {
      await supabase.from("imports").update({ status: "failed", row_count: added }).eq("id", imported.id);
      await moveOwnBalance(supabase, account.id, addedRows);
      revalidatePath("/", "layout");
      return {
        ok: false,
        message: added ? `Saved ${added} transactions, then something went wrong. Upload the file again to add the rest.` : "Couldn't save them. Try again.",
      };
    }
    added += data?.length ?? 0;
    for (const row of data ?? []) addedRows.push({ postedOn: row.posted_on, amount: Number(row.amount) });
  }
  await moveOwnBalance(supabase, account.id, addedRows);
  await supabase.from("imports").update({ status: "done", row_count: added }).eq("id", imported.id);
  revalidatePath("/", "layout");
  const already = clean.length - added;
  return {
    ok: true,
    added,
    already,
    message: `Added ${added} ${added === 1 ? "transaction" : "transactions"} to ${account.name}${already ? `, skipped ${already} you already had` : ""}.`,
  };
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { easternDay } from "@/lib/budget/own-balance";
import type { WalletAccount, WalletTransaction } from "./parse";

// Saves what WalletFeed sent. Always called with the server's admin client,
// for the user whose feed the post was signed for, so every query filters
// by that user_id.
type Admin = SupabaseClient;

// An uploaded transaction counts as the same as a Wallet one when it's on the
// same account, for the same amount, within this many days.
const MATCH_DAYS = 3;

function addDays(day: string, days: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const daysApart = (a: string, b: string) =>
  Math.abs(new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86_400_000;

export async function saveWalletAccount(admin: Admin, userId: string, account: WalletAccount) {
  // Only what this post says, so a balance post (which has no bank name)
  // doesn't erase the name an account post gave.
  const row: Record<string, unknown> = { user_id: userId, wallet_account_id: account.walletAccountId, removed_at: null };
  if (account.name) row.name = account.name;
  if (account.institution) row.institution = account.institution;
  if (account.accountType) row.account_type = account.accountType;
  const { error } = await admin.from("wallet_accounts").upsert(row, { onConflict: "user_id,wallet_account_id" });
  if (error) throw new Error(`Saving the Wallet account failed: ${error.message}`);
}

export async function removeWalletAccount(admin: Admin, userId: string, walletAccountId: string) {
  const { error } = await admin
    .from("wallet_accounts")
    .update({ removed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("wallet_account_id", walletAccountId);
  if (error) throw new Error(`Marking the Wallet account removed failed: ${error.message}`);
}

type Link = { wallet_account_id: string; account_id: string | null; linked_at: string | null };

async function links(admin: Admin, userId: string, walletAccountIds: string[]) {
  const { data, error } = await admin
    .from("wallet_accounts")
    .select("wallet_account_id, account_id, linked_at")
    .eq("user_id", userId)
    .in("wallet_account_id", walletAccountIds);
  if (error) throw new Error(`Reading Wallet accounts failed: ${error.message}`);
  return new Map((data as Link[]).map((l) => [l.wallet_account_id, l]));
}

type Staged = {
  wallet_transaction_id: string;
  wallet_account_id: string;
  posted_on: string;
  description: string;
  merchant: string | null;
  amount: number;
  pending: boolean;
  bank_category: string | null;
  from_history: boolean;
};

// Saves Wallet transactions, then copies the ones on linked accounts into
// your transactions. Returns how many landed in your transactions.
export async function saveWalletTransactions(admin: Admin, userId: string, list: WalletTransaction[], fromHistory: boolean) {
  if (!list.length) return 0;

  // A transaction can name an account WalletFeed hasn't described yet
  // (Accounts switches off). Note the account so it can be linked.
  const accounts = new Map<string, WalletAccount>();
  for (const t of list) {
    if (!accounts.has(t.walletAccountId)) {
      accounts.set(t.walletAccountId, { walletAccountId: t.walletAccountId, name: t.accountName, institution: null, accountType: t.accountType });
    }
  }
  const { error: accountError } = await admin.from("wallet_accounts").upsert(
    [...accounts.values()].map((a) => ({
      user_id: userId,
      wallet_account_id: a.walletAccountId,
      name: a.name,
      account_type: a.accountType,
    })),
    { onConflict: "user_id,wallet_account_id", ignoreDuplicates: true },
  );
  if (accountError) throw new Error(`Saving Wallet accounts failed: ${accountError.message}`);

  const staged: Staged[] = list.map((t) => ({
    wallet_transaction_id: t.walletTransactionId,
    wallet_account_id: t.walletAccountId,
    posted_on: t.postedOn,
    description: t.description,
    merchant: t.merchant,
    amount: t.amount,
    pending: t.pending,
    bank_category: t.bankCategory,
    from_history: fromHistory,
  }));
  const { error } = await admin.from("wallet_transactions").upsert(
    staged.map((s) => ({ ...s, user_id: userId, updated_at: new Date().toISOString() })),
    { onConflict: "user_id,wallet_transaction_id" },
  );
  if (error) throw new Error(`Saving Wallet transactions failed: ${error.message}`);

  return copyToTransactions(admin, userId, staged);
}

// Copies saved Wallet transactions into your transactions, on the account
// each Wallet account is linked to. A pending purchase and its posted version
// stay one row, and its category and review mark are kept. An uploaded
// transaction that matches is taken over instead of added twice.
async function copyToTransactions(admin: Admin, userId: string, staged: Staged[]) {
  const linkByWallet = await links(admin, userId, [...new Set(staged.map((s) => s.wallet_account_id))]);
  const linked = staged.filter((s) => linkByWallet.get(s.wallet_account_id)?.account_id);
  if (!linked.length) return 0;

  let count = 0;
  // In chunks, so a long history stays within what one query can name.
  for (let i = 0; i < linked.length; i += 100) {
    count += await copyChunk(admin, userId, linked.slice(i, i + 100), linkByWallet);
  }
  return count;
}

async function copyChunk(admin: Admin, userId: string, chunk: Staged[], linkByWallet: Map<string, Link>) {
  const { data: existing, error } = await admin
    .from("transactions")
    .select("id, wallet_transaction_id, source, plaid_category")
    .eq("user_id", userId)
    .in("wallet_transaction_id", chunk.map((s) => s.wallet_transaction_id));
  if (error) throw new Error(`Reading transactions failed: ${error.message}`);
  const byWalletId = new Map((existing ?? []).map((r) => [r.wallet_transaction_id as string, r]));

  const fresh = chunk.filter((s) => !byWalletId.has(s.wallet_transaction_id));
  const taken = new Set<string>();
  const inserts: Record<string, unknown>[] = [];

  // Uploaded transactions that might be these, per linked account.
  const byAccount = new Map<string, Staged[]>();
  for (const s of fresh) {
    const accountId = linkByWallet.get(s.wallet_account_id)!.account_id!;
    byAccount.set(accountId, [...(byAccount.get(accountId) ?? []), s]);
  }
  for (const [accountId, rows] of byAccount) {
    const days = rows.map((r) => r.posted_on).sort();
    const { data: candidates, error: candidateError } = await admin
      .from("transactions")
      .select("id, posted_on, amount, plaid_category")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .in("source", ["upload", "manual"])
      .is("wallet_transaction_id", null)
      .gte("posted_on", addDays(days[0], -MATCH_DAYS))
      .lte("posted_on", addDays(days[days.length - 1], MATCH_DAYS));
    if (candidateError) throw new Error(`Reading uploaded transactions failed: ${candidateError.message}`);

    for (const s of rows) {
      const match = (candidates ?? [])
        .filter((c) => !taken.has(c.id) && Number(c.amount) === s.amount && daysApart(c.posted_on, s.posted_on) <= MATCH_DAYS)
        .sort((a, b) => daysApart(a.posted_on, s.posted_on) - daysApart(b.posted_on, s.posted_on))[0];
      if (match) {
        taken.add(match.id);
        // Keep what you uploaded (its description, category and review
        // mark); only remember it's this Wallet transaction.
        const { error: adoptError } = await admin
          .from("transactions")
          .update({ wallet_transaction_id: s.wallet_transaction_id, pending: s.pending, plaid_category: match.plaid_category ?? s.bank_category })
          .eq("id", match.id)
          .eq("user_id", userId);
        if (adoptError) throw new Error(`Matching an uploaded transaction failed: ${adoptError.message}`);
        continue;
      }
      // History from before you linked the account counts as reviewed, so a
      // year of past purchases doesn't fill Pending to review.
      const linkedOn = easternDay(linkByWallet.get(s.wallet_account_id)!.linked_at);
      const reviewed = s.from_history && linkedOn !== null && s.posted_on < linkedOn;
      inserts.push({
        user_id: userId,
        account_id: accountId,
        posted_on: s.posted_on,
        description: s.description,
        merchant: s.merchant,
        amount: s.amount,
        pending: s.pending,
        source: "wallet",
        fingerprint: `wallet:${s.wallet_transaction_id}`,
        wallet_transaction_id: s.wallet_transaction_id,
        plaid_category: s.bank_category,
        reviewed_at: reviewed ? new Date().toISOString() : null,
      });
    }
  }

  if (inserts.length) {
    const { error: insertError } = await admin.from("transactions").insert(inserts);
    if (insertError) throw new Error(`Adding transactions failed: ${insertError.message}`);
  }

  // Ones already here: a pending purchase that posted, or a changed amount.
  for (const s of chunk) {
    const row = byWalletId.get(s.wallet_transaction_id);
    if (!row) continue;
    const accountId = linkByWallet.get(s.wallet_account_id)!.account_id!;
    const change =
      row.source === "wallet"
        ? { account_id: accountId, posted_on: s.posted_on, description: s.description, merchant: s.merchant, amount: s.amount, pending: s.pending, plaid_category: s.bank_category }
        : { pending: s.pending };
    const { error: updateError } = await admin.from("transactions").update(change).eq("id", row.id).eq("user_id", userId);
    if (updateError) throw new Error(`Updating a transaction failed: ${updateError.message}`);
  }

  return chunk.length;
}

// A declined or expired purchase, or one Apple removed. Rows that came from
// WalletFeed go; an uploaded one it had matched stays, unmatched.
export async function deleteWalletTransaction(admin: Admin, userId: string, walletTransactionId: string) {
  const steps = await Promise.all([
    admin.from("transactions").delete().eq("user_id", userId).eq("wallet_transaction_id", walletTransactionId).eq("source", "wallet"),
    admin
      .from("transactions")
      .update({ wallet_transaction_id: null })
      .eq("user_id", userId)
      .eq("wallet_transaction_id", walletTransactionId)
      .neq("source", "wallet"),
    admin.from("wallet_transactions").delete().eq("user_id", userId).eq("wallet_transaction_id", walletTransactionId),
  ]);
  const failed = steps.find((s) => s.error);
  if (failed?.error) throw new Error(`Removing the transaction failed: ${failed.error.message}`);
}

async function setAccountBalance(admin: Admin, userId: string, accountId: string, balance: number) {
  const { error } = await admin
    .from("accounts")
    .update({ current_balance: balance, balance_updated_at: new Date().toISOString() })
    .eq("id", accountId)
    .eq("user_id", userId);
  if (error) throw new Error(`Updating the balance failed: ${error.message}`);
}

export async function saveWalletBalance(admin: Admin, userId: string, account: WalletAccount, balance: number, asOf: string | null) {
  await saveWalletAccount(admin, userId, account);
  const { data, error } = await admin
    .from("wallet_accounts")
    .update({ balance, balance_as_of: asOf ?? new Date().toISOString() })
    .eq("user_id", userId)
    .eq("wallet_account_id", account.walletAccountId)
    .select("account_id")
    .single();
  if (error) throw new Error(`Saving the Wallet balance failed: ${error.message}`);
  if (data.account_id) await setAccountBalance(admin, userId, data.account_id, balance);
}

// Links a Wallet account to one of your own accounts (or unlinks it with
// null), then brings in everything WalletFeed already sent for it.
export async function linkWalletAccount(admin: Admin, userId: string, walletAccountId: string, accountId: string | null) {
  const { data: wallet } = await admin
    .from("wallet_accounts")
    .select("wallet_account_id, balance")
    .eq("user_id", userId)
    .eq("wallet_account_id", walletAccountId)
    .maybeSingle();
  if (!wallet) return { ok: false as const, message: "That Wallet account isn't here anymore. Reload the page." };

  if (accountId) {
    const { data: account } = await admin
      .from("accounts")
      .select("id")
      .eq("id", accountId)
      .eq("user_id", userId)
      .in("source", ["manual", "upload"])
      .maybeSingle();
    if (!account) return { ok: false as const, message: "Pick one of your own accounts." };
    const { data: other } = await admin
      .from("wallet_accounts")
      .select("wallet_account_id")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .neq("wallet_account_id", walletAccountId)
      .limit(1);
    if (other?.length) return { ok: false as const, message: "Another Wallet account already fills that account." };
  }

  const { error } = await admin
    .from("wallet_accounts")
    .update({ account_id: accountId, linked_at: accountId ? new Date().toISOString() : null })
    .eq("user_id", userId)
    .eq("wallet_account_id", walletAccountId);
  if (error) return { ok: false as const, message: "Couldn't save the link. Try again." };
  if (!accountId) return { ok: true as const, message: "Unlinked. Its transactions so far stay where they are." };

  // Everything WalletFeed already sent for this account.
  let copied = 0;
  for (let from = 0; ; from += 1000) {
    const { data: rows, error: readError } = await admin
      .from("wallet_transactions")
      .select("wallet_transaction_id, wallet_account_id, posted_on, description, merchant, amount, pending, bank_category, from_history")
      .eq("user_id", userId)
      .eq("wallet_account_id", walletAccountId)
      .order("posted_on")
      .range(from, from + 999);
    if (readError) return { ok: false as const, message: "Linked, but bringing in earlier transactions failed. Link it again to retry." };
    if (!rows?.length) break;
    try {
      copied += await copyToTransactions(
        admin,
        userId,
        rows.map((r) => ({ ...r, amount: Number(r.amount) })),
      );
    } catch (e) {
      console.error("Wallet link copy failed", { message: e instanceof Error ? e.message : String(e) });
      return { ok: false as const, message: "Linked, but bringing in earlier transactions failed. Link it again to retry." };
    }
    if (rows.length < 1000) break;
  }
  if (wallet.balance !== null) await setAccountBalance(admin, userId, accountId, Number(wallet.balance));
  return { ok: true as const, message: copied ? `Linked. Brought in ${copied} transactions WalletFeed already sent.` : "Linked." };
}

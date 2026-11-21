import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { AppHeader } from "../app-header";
import { requireTwoFactorUser } from "@/lib/auth";
import { isPlaidConfigured, plaidEnv } from "@/lib/plaid/client";
import { bankStatus } from "@/lib/plaid/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { gmailConfirmLink } from "@/lib/venmo/parse";
import { ConnectBankButton, FixBankButton } from "./connect-button";
import { SyncButton } from "./sync-button";
import { clearGmailConfirmation } from "./venmo-actions";
import { OwnAccounts } from "./own-accounts";
import { CorrectBalanceForm, StartVenmoForm } from "./venmo-forms";
import { startWalletFeed } from "./wallet-actions";
import { CopyAddress, LinkAccountForm, SecretForm } from "./wallet-forms";

export const metadata: Metadata = { title: "Banks · Budget Manager" };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function when(timestamp: string | null) {
  if (!timestamp) return "never";
  return new Date(timestamp).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function Banks() {
  const { userId, supabase } = await requireTwoFactorUser();
  const env = plaidEnv();

  if (!isPlaidConfigured()) {
    return (
      <p className="mt-6 rounded-xl border border-dashed border-black/15 p-6 text-sm dark:border-white/20">
        Plaid isn&apos;t set up on this site yet. Add PLAID_CLIENT_ID and PLAID_SECRET in Vercel.
      </p>
    );
  }

  // Connections come from the server-only table (never the access token);
  // accounts come through your own session, so row-level security applies.
  const [{ data: items }, { data: accounts }] = await Promise.all([
    createAdminClient()
      .from("plaid_items")
      .select("id, institution_name, environment, last_synced_at, last_error")
      .eq("user_id", userId)
      .eq("environment", env)
      .order("created_at"),
    supabase.from("accounts").select("id, name, type, mask, current_balance, plaid_item_id"),
  ]);

  return (
    <div className="mt-6">
      {env === "sandbox" ? (
        <p className="mb-4 rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
          Test mode: this site uses Plaid&apos;s fake bank. Sign in there with user_good and pass_good.
        </p>
      ) : null}

      <ConnectBankButton />
      <p className="mt-2 text-xs text-black/50 dark:text-white/50">
        You sign in to your bank on Plaid&apos;s screen. Your bank password never reaches this app. Connected banks sync by
        themselves every morning around 6 AM.
      </p>

      <ul className="mt-8 space-y-4">
        {(items ?? []).map((item) => {
          const itemAccounts = (accounts ?? []).filter((a) => a.plaid_item_id === item.id);
          const status = bankStatus(item);
          return (
            <li key={item.id} className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.institution_name ?? "Bank"}</p>
                  <p className="text-xs text-black/50 dark:text-white/50">Last synced {when(item.last_synced_at)}</p>
                  {status.kind !== "ok" ? (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">{status.message}</p>
                  ) : null}
                </div>
                <SyncButton itemId={item.id} />
              </div>
              {status.kind === "sign-in" ? (
                <div className="mt-3">
                  <FixBankButton itemId={item.id} bank={item.institution_name ?? "your bank"} />
                </div>
              ) : null}
              <ul className="mt-3 divide-y divide-black/10 text-sm dark:divide-white/10">
                {itemAccounts.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 py-2">
                    <span>
                      {a.name}
                      {a.mask ? ` ···${a.mask}` : ""}
                    </span>
                    <span className="tabular-nums">{a.current_balance === null ? "" : money.format(a.current_balance)}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Accounts you added yourself, filled by uploads instead of a bank link.
async function YourAccounts() {
  const { supabase } = await requireTwoFactorUser();
  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("id, name, institution, type, mask, current_balance")
    .in("source", ["manual", "upload"])
    .order("created_at");
  if (error) {
    return <p className="mt-10 text-sm text-red-600 dark:text-red-400">Your own accounts couldn&apos;t load. Try again in a minute.</p>;
  }
  const counts = await Promise.all(
    (accounts ?? []).map((a) =>
      supabase.from("transactions").select("id", { count: "exact", head: true }).eq("account_id", a.id),
    ),
  );
  return (
    <OwnAccounts
      accounts={(accounts ?? []).map((a, i) => ({
        id: a.id,
        name: a.name,
        institution: a.institution,
        type: a.type,
        mask: a.mask,
        balance: a.current_balance === null ? null : Number(a.current_balance),
        transactionCount: counts[i].count ?? 0,
      }))}
    />
  );
}

const OUTCOME_LABEL: Record<string, string> = {
  added: "Added",
  duplicate: "Already had it",
  skipped: "Skipped",
  ignored: "No money moved",
  unverified: "Not trusted",
  failed: "Failed",
};

function withinADay(timestamp: string | null) {
  return Boolean(timestamp) && Date.now() - new Date(timestamp!).getTime() < 86_400_000;
}

// Venmo comes from Venmo's own emails, forwarded to the app.
async function Venmo() {
  const { supabase } = await requireTwoFactorUser();
  const { data: claims } = await supabase.auth.getClaims();
  const [{ data: feed }, { data: emails }] = await Promise.all([
    supabase
      .from("venmo_feeds")
      .select("account_id, inbound_address, mailbox, last_email_at, gmail_confirmation, gmail_confirmation_url, gmail_confirmation_at")
      .maybeSingle(),
    supabase.from("venmo_emails").select("id, received_at, subject, outcome, detail").order("created_at", { ascending: false }).limit(8),
  ]);
  const { data: account } = feed
    ? await supabase.from("accounts").select("current_balance, balance_updated_at").eq("id", feed.account_id).maybeSingle()
    : { data: null };

  // A Gmail confirmation code or link is only useful for a day, and not at
  // all once Venmo emails have started arriving (forwarding then works).
  const forwardingWorks =
    Boolean(feed?.last_email_at && feed?.gmail_confirmation_at) &&
    new Date(feed!.last_email_at!) > new Date(feed!.gmail_confirmation_at!);
  const fresh = withinADay(feed?.gmail_confirmation_at ?? null) && !forwardingWorks;
  const showCode = fresh && feed?.gmail_confirmation;
  // Checked again here so only Google's own confirm link is ever shown.
  const confirmLink = fresh && feed?.gmail_confirmation_url ? gmailConfirmLink(feed.gmail_confirmation_url) : null;

  return (
    <section className="mt-10 rounded-2xl border border-black/10 p-4 dark:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">Venmo</p>
          <p className="text-xs text-black/50 dark:text-white/50">
            {feed ? `From Venmo's emails · last one ${when(feed.last_email_at)}` : "Tracked from Venmo's emails, not Plaid"}
          </p>
        </div>
        {account?.current_balance != null ? (
          <span className="tabular-nums">{money.format(account.current_balance)}</span>
        ) : null}
      </div>

      {!feed ? (
        <StartVenmoForm mailbox={String(claims?.claims?.email ?? "")} />
      ) : (
        <>
          <p className="mt-3 text-sm">
            Venmo emails forwarded to <span className="font-mono">{feed.inbound_address}</span> update this balance.
          </p>
          {showCode || confirmLink ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm dark:bg-emerald-500/10">
              <p>
                {showCode ? (
                  <>
                    Gmail forwarding confirmation code: <span className="font-mono font-semibold">{feed.gmail_confirmation}</span>
                  </>
                ) : (
                  <>
                    Gmail sent a link to confirm forwarding to {feed.inbound_address}.{" "}
                    <a href={confirmLink!} target="_blank" rel="noreferrer noopener" className="font-semibold underline">
                      Confirm forwarding in Gmail
                    </a>
                  </>
                )}
              </p>
              <form action={clearGmailConfirmation}>
                <button type="submit" className="rounded-lg border border-black/15 px-3 py-1.5 text-xs dark:border-white/20">
                  Done, hide this
                </button>
              </form>
            </div>
          ) : null}
          <CorrectBalanceForm />
          {emails?.length ? (
            <ul className="mt-4 divide-y divide-black/10 text-sm dark:divide-white/10">
              {emails.map((e) => (
                <li key={e.id} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{e.subject}</span>
                    {e.detail ? <span className="block text-xs text-black/50 dark:text-white/50">{e.detail}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-black/60 dark:text-white/60">{OUTCOME_LABEL[e.outcome] ?? e.outcome}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-xs text-black/50 dark:text-white/50">No Venmo emails have arrived yet.</p>
          )}
        </>
      )}
    </section>
  );
}

const WALLET_OUTCOME: Record<string, string> = {
  saved: "Saved",
  ignored: "Nothing to save",
  duplicate: "Already had it",
  failed: "Failed",
};

const WALLET_EVENT: Record<string, string> = {
  "transaction.created": "New transaction",
  "transaction.updated": "Changed transaction",
  "transaction.deleted": "Removed transaction",
  "transaction.backfilled": "History",
  "balance.updated": "Balance",
  "account.added": "Account added",
  "account.updated": "Account details",
  "account.removed": "Account removed",
};

// The account a Wallet account most likely is: Apple Card to a card, Apple
// Savings to savings, Apple Cash to cash, going by name and kind.
function suggestAccount(
  wallet: { name: string | null; account_type: string | null },
  accounts: { id: string; name: string; type: string }[],
) {
  const name = (wallet.name ?? "").toLowerCase();
  const kind = name.includes("saving") ? "savings" : name.includes("cash") ? "cash" : wallet.account_type === "liability" || name.includes("card") ? "credit" : null;
  const word = kind === "credit" ? "card" : kind;
  return (
    accounts.find((a) => word !== null && a.name.toLowerCase().includes(word) && a.name.toLowerCase().includes("apple"))?.id ??
    accounts.find((a) => kind !== null && a.type === kind && a.name.toLowerCase().includes("apple"))?.id ??
    null
  );
}

// Apple Card, Apple Cash and Apple Savings, posted by the WalletFeed app.
async function AppleWallet() {
  const { userId, supabase } = await requireTwoFactorUser();
  const admin = createAdminClient();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "budget.torrezhq.com";

  const [{ data: feed }, { data: walletAccounts }, { data: events }, { data: own }] = await Promise.all([
    admin.from("wallet_feeds").select("feed_id, secret_set_at, last_event_at").eq("user_id", userId).maybeSingle(),
    admin
      .from("wallet_accounts")
      .select("wallet_account_id, name, institution, account_type, account_id, balance, removed_at")
      .eq("user_id", userId)
      .order("created_at"),
    admin
      .from("wallet_events")
      .select("id, event_type, test, outcome, detail, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("accounts").select("id, name, type").in("source", ["manual", "upload"]).order("created_at"),
  ]);
  const ownAccounts = own ?? [];

  return (
    <section className="mt-10 rounded-2xl border border-black/10 p-4 dark:border-white/15">
      <p className="font-medium">Apple Wallet</p>
      <p className="text-xs text-black/50 dark:text-white/50">
        {feed?.last_event_at
          ? `From the WalletFeed app on your iPhone · last update ${when(feed.last_event_at)}`
          : "Apple Card, Apple Cash and Apple Savings, sent by the WalletFeed app on your iPhone"}
      </p>

      {!feed ? (
        <form action={startWalletFeed} className="mt-3">
          <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white dark:bg-emerald-500">
            Set up Apple Wallet
          </button>
        </form>
      ) : (
        <>
          <p className="mt-3 text-sm">In WalletFeed, add a Webhook destination with this address:</p>
          <CopyAddress address={`https://${host}/api/wallet/${feed.feed_id}`} />

          {feed.secret_set_at ? (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-black/70 dark:text-white/70">
                Signing secret saved {when(feed.secret_set_at)}. Replace it
              </summary>
              <SecretForm replacing />
            </details>
          ) : (
            <>
              <p className="mt-3 text-sm">
                Then copy the destination&apos;s signing secret from WalletFeed and paste it here. Only posts signed with it are
                trusted.
              </p>
              <SecretForm replacing={false} />
            </>
          )}

          {walletAccounts?.length ? (
            <ul className="mt-4 divide-y divide-black/10 text-sm dark:divide-white/10">
              {walletAccounts.map((w) => (
                <li key={w.wallet_account_id} className="py-3">
                  <div className="flex justify-between gap-3">
                    <span>
                      {w.name ?? "Wallet account"}
                      {w.removed_at ? <span className="text-xs text-black/50 dark:text-white/50"> · removed in WalletFeed</span> : null}
                    </span>
                    <span className="tabular-nums">{w.balance === null ? "" : money.format(Number(w.balance))}</span>
                  </div>
                  <LinkAccountForm
                    walletAccountId={w.wallet_account_id}
                    current={w.account_id}
                    suggested={w.account_id ? null : suggestAccount(w, ownAccounts)}
                    options={ownAccounts.map((a) => ({ id: a.id, name: a.name }))}
                  />
                </li>
              ))}
            </ul>
          ) : feed.secret_set_at ? (
            <p className="mt-4 text-xs text-black/50 dark:text-white/50">
              Your Wallet accounts show up here once WalletFeed sends them. Then pick which of your accounts each one fills.
            </p>
          ) : null}

          {events?.length ? (
            <ul className="mt-4 divide-y divide-black/10 text-sm dark:divide-white/10">
              {events.map((e) => (
                <li key={e.id} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">
                      {e.test ? "Test" : (WALLET_EVENT[e.event_type] ?? "Update")} · {when(e.created_at)}
                    </span>
                    {e.detail ? <span className="block text-xs text-black/50 dark:text-white/50">{e.detail}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-black/60 dark:text-white/60">{WALLET_OUTCOME[e.outcome] ?? e.outcome}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

export default function BanksPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <AppHeader />
      <h1 className="mt-6 text-xl font-semibold">Banks</h1>
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <Banks />
      </Suspense>
      <Suspense fallback={null}>
        <YourAccounts />
      </Suspense>
      <Suspense fallback={null}>
        <AppleWallet />
      </Suspense>
      <Suspense fallback={null}>
        <Venmo />
      </Suspense>
    </main>
  );
}

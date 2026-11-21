import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteWalletTransaction,
  removeWalletAccount,
  saveWalletAccount,
  saveWalletBalance,
  saveWalletTransactions,
} from "@/lib/wallet/apply";
import { readEnvelope, readEvent } from "@/lib/wallet/parse";
import { verifyWalletPost } from "@/lib/wallet/verify";

// Receives one post from the WalletFeed iPhone app (Apple Card, Apple Cash,
// Apple Savings). Needs no password: only posts signed with the secret you
// pasted on the Banks page are acted on, and nothing here can be read back.
// WalletFeed retries on a 5xx, so an answer of 2xx only comes after saving.
// It never gets a 410, which would turn the destination off in WalletFeed.
const MAX_BYTES = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Outcome = "saved" | "ignored" | "duplicate" | "failed";

function reply(status: number, message: string) {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ feedId: string }> }) {
  const { feedId } = await params;
  if (!UUID.test(feedId)) return reply(404, "No feed here.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return reply(413, "Post too large.");

  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length === 0 || raw.length > MAX_BYTES) return reply(413, "Post empty or too large.");

  const admin = createAdminClient();
  const { data: feed } = await admin.from("wallet_feeds").select("user_id, signing_secret").eq("feed_id", feedId).maybeSingle();
  if (!feed) return reply(404, "No feed here.");

  const webhookId = (request.headers.get("webhook-id") ?? "").slice(0, 100) || "(none)";

  async function log(outcome: Outcome, eventType: string, detail: string | null, test = false) {
    const { error } = await admin.from("wallet_events").insert({
      user_id: feed!.user_id,
      webhook_id: webhookId,
      event_type: eventType.slice(0, 100),
      test,
      outcome,
      detail: detail?.slice(0, 300) ?? null,
    });
    if (error) console.error("Wallet event log failed", { message: error.message });
  }

  if (!feed.signing_secret) {
    await log("failed", "unknown", "No signing secret saved yet. Paste it on the Banks page.");
    return reply(401, "No signing secret saved yet.");
  }

  // Checked on the exact bytes sent, before reading them as JSON.
  const verdict = verifyWalletPost({
    secret: feed.signing_secret,
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
    body: raw,
  });
  if (!verdict.ok) {
    await log("failed", "unknown", `Not trusted: ${verdict.reason}`);
    return reply(401, "Signature check failed.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    await log("failed", "unknown", "Not JSON");
    return reply(400, "Send JSON.");
  }
  const envelope = readEnvelope(parsed);
  if (!envelope) {
    await log("failed", "unknown", "Missing the event id or type");
    return reply(400, "Missing the event id or type.");
  }

  // A retry of a post already saved.
  const { data: seen } = await admin
    .from("wallet_events")
    .select("id")
    .eq("user_id", feed.user_id)
    .eq("webhook_id", webhookId)
    .in("outcome", ["saved", "ignored", "duplicate"])
    .limit(1);
  if (webhookId !== "(none)" && seen?.length) {
    await log("duplicate", envelope.type, null, envelope.test);
    return reply(200, "ok");
  }

  // Send Test and samples prove the connection works; their made-up
  // "Sample Card" data isn't saved.
  if (envelope.test) {
    await log("ignored", envelope.type, "Test from WalletFeed received. The connection works.", true);
    await admin.from("wallet_feeds").update({ last_event_at: new Date().toISOString() }).eq("user_id", feed.user_id);
    return reply(200, "ok");
  }

  const event = readEvent(envelope);
  try {
    let detail: string | null = null;
    switch (event.kind) {
      case "ignored":
        await log("ignored", envelope.type, event.reason);
        return reply(200, "ok");
      case "transactions": {
        const copied = await saveWalletTransactions(admin, feed.user_id, event.transactions, event.fromHistory);
        const n = event.transactions.length;
        detail =
          copied === n
            ? `${n} transaction${n === 1 ? "" : "s"}`
            : `${n} transaction${n === 1 ? "" : "s"}, ${n - copied} waiting for you to link the account`;
        break;
      }
      case "deleted":
        await deleteWalletTransaction(admin, feed.user_id, event.walletTransactionId);
        detail = "Declined or removed purchase taken out";
        break;
      case "account":
        await saveWalletAccount(admin, feed.user_id, event.account);
        detail = event.account.name;
        break;
      case "account_removed":
        await removeWalletAccount(admin, feed.user_id, event.walletAccountId);
        detail = "Account removed in WalletFeed";
        break;
      case "balance":
        await saveWalletBalance(admin, feed.user_id, event.account, event.balance, event.asOf);
        detail = event.account.name;
        break;
    }
    await log("saved", envelope.type, detail);
    await admin.from("wallet_feeds").update({ last_event_at: new Date().toISOString() }).eq("user_id", feed.user_id);
    return reply(200, "ok");
  } catch (e) {
    console.error("Wallet post failed", { type: envelope.type, message: e instanceof Error ? e.message : String(e) });
    await log("failed", envelope.type, "Saving failed. WalletFeed will try again.");
    return reply(500, "Saving failed.");
  }
}

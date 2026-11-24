import PostalMime from "postal-mime";
import { notifyNewToReview } from "@/lib/push/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseGmailConfirmation, parseVenmoEmail } from "@/lib/venmo/parse";
import { verifiedSenderDomain } from "@/lib/venmo/verify";

// Receives one forwarded email from the Cloudflare Email Worker
// (cloudflare/venmo-email-worker). Needs no password: only emails with a
// valid Venmo (or Google) DKIM signature are acted on, every Venmo
// transaction ID is saved once, and nothing here can be read back.
const MAX_BYTES = 2 * 1024 * 1024;

type Outcome = "added" | "duplicate" | "skipped" | "ignored" | "unverified" | "failed";

function reply(status: number, message: string) {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function POST(request: Request) {
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== "message/rfc822") return reply(415, "Send the raw email as message/rfc822.");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return reply(413, "Email too large.");

  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length === 0 || raw.length > MAX_BYTES) return reply(413, "Email empty or too large.");

  // The address the email was forwarded to picks whose Venmo feed it is.
  const to = (request.headers.get("x-envelope-to") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._+-]+@[a-z0-9.-]+$/.test(to)) return reply(400, "Missing x-envelope-to.");

  const admin = createAdminClient();
  const { data: feed } = await admin
    .from("venmo_feeds")
    .select("user_id, account_id, mailbox")
    .eq("inbound_address", to)
    .maybeSingle();
  if (!feed) return reply(404, "No Venmo feed for that address.");

  const [sender, email] = await Promise.all([verifiedSenderDomain(raw), PostalMime.parse(raw)]);
  const subject = (email.subject ?? "(no subject)").replace(/\s+/g, " ").trim().slice(0, 300);
  const sentAt = email.date ? new Date(email.date) : new Date();
  const receivedAt = Number.isNaN(sentAt.getTime()) ? new Date() : sentAt;
  const text = email.text?.trim() ? email.text : (email.html ?? "");

  async function log(outcome: Outcome, detail: string | null, transactionId: string | null = null) {
    const { error } = await admin.from("venmo_emails").insert({
      user_id: feed!.user_id,
      received_at: receivedAt.toISOString(),
      subject,
      outcome,
      detail: detail?.slice(0, 300) ?? null,
      transaction_id: transactionId,
    });
    if (error) console.error("Venmo email log failed", { message: error.message });
  }

  // Gmail's "confirm this forwarding address" email.
  if (sender.domain === "google.com" && sender.from === "forwarding-noreply@google.com") {
    const found = parseGmailConfirmation({ subject, text: email.text ?? "", html: email.html ?? "", mailbox: feed.mailbox });
    // Only for forwarding from your own mailbox, so nobody else can swap in their code.
    if (found.mentionsMailbox && (found.code || found.link)) {
      const { error } = await admin
        .from("venmo_feeds")
        .update({
          gmail_confirmation: found.code,
          gmail_confirmation_url: found.link,
          gmail_confirmation_at: new Date().toISOString(),
        })
        .eq("user_id", feed.user_id);
      if (error) {
        await log("failed", "Couldn't save Gmail's confirmation");
        return reply(500, "Couldn't save.");
      }
      await log("ignored", found.code ? "Gmail forwarding code saved" : "Gmail confirm link saved");
    } else {
      // Say which part was missing, never the email's text.
      const why = !found.mentionsMailbox
        ? "doesn't mention your mailbox"
        : `no code or Google confirm link (text ${email.text?.length ?? 0} chars, html ${email.html?.length ?? 0} chars)`;
      await log("ignored", `Gmail email: ${why}`);
    }
    return reply(200, "ok");
  }

  // The email must have been sent to your own mailbox, not someone else's.
  const sentTo = (email.to ?? []).map((a) => a.address?.toLowerCase()).filter(Boolean);
  const forYou = sender.signedTo && sentTo.includes(feed.mailbox.toLowerCase());

  if (sender.domain !== "venmo.com" || !forYou) {
    // Only keep a note when it claims to be Venmo, so stray mail doesn't
    // fill the log. Accept it either way so it isn't retried.
    if (sender.domain === "venmo.com") await log("unverified", "Real Venmo email, but not sent to your mailbox");
    else if (sender.from?.endsWith("venmo.com")) await log("unverified", `Signature check failed: ${sender.detail}`);
    else console.warn("Venmo inbound: email from another sender ignored");
    return reply(200, "ok");
  }

  const event = parseVenmoEmail({ subject, text, receivedAt });

  if (event.kind === "ignored") {
    await log("ignored", event.reason);
    return reply(200, "ok");
  }
  if (event.kind === "paid_from_bank") {
    await log("skipped", `Paid from ${event.fundedBy}, so it's already in that account`);
    return reply(200, "ok");
  }

  const row =
    event.kind === "payment"
      ? {
          description: event.memo ? `${event.counterparty}: ${event.memo}` : event.counterparty,
          merchant: event.counterparty,
          notes: event.memo,
          fingerprint: `venmo:${event.venmoId}`,
        }
      : {
          description: event.destination ? `Transfer to ${event.destination}` : "Transfer to bank",
          merchant: null,
          notes: null,
          fingerprint: `venmo-transfer:${event.venmoId}`,
        };

  const { data: transactionId, error } = await admin.rpc("add_venmo_transaction", {
    p_user_id: feed.user_id,
    p_posted_on: event.postedOn,
    p_description: row.description.slice(0, 500),
    p_merchant: row.merchant,
    p_amount: event.amount,
    p_notes: row.notes,
    p_fingerprint: row.fingerprint,
    p_email_at: receivedAt.toISOString(),
  });
  if (error) {
    console.error("Venmo transaction failed", { message: error.message });
    await log("failed", "Saving the transaction failed");
    // A 500 makes the worker bounce it, so the email isn't silently lost.
    return reply(500, "Saving failed.");
  }

  // A cash-out to your bank is money moving between your own accounts, so it
  // starts out sorted as a transfer, not spending.
  if (transactionId && event.kind !== "payment") {
    const { error: sortError } = await admin
      .from("transactions")
      .update({ plaid_category: "TRANSFER_OUT_ACCOUNT_TRANSFER" })
      .eq("id", transactionId)
      .is("plaid_category", null);
    if (sortError) console.error("Venmo transfer sorting failed", { message: sortError.message });
  }

  await log(transactionId ? "added" : "duplicate", null, (transactionId as string | null) ?? null);
  // A phone alert for the new Venmo transaction, if alerts are on.
  if (transactionId) await notifyNewToReview(admin, [feed.user_id]);
  return reply(200, "ok");
}

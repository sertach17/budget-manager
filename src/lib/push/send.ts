import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { reviewAlert, type AlertPayload } from "./message";

type Keys = { publicKey: string; privateKey: string };

// The address push services see as the sender. Apple wants a web address or
// an email here.
function subject() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || "budget.torrezhq.com";
  return `https://${host}`;
}

// The site's push key pair. Made once, the first time it's needed, and kept
// in a table only the server can read.
export async function pushKeys(admin: SupabaseClient): Promise<Keys> {
  const read = async () => {
    const { data, error } = await admin.from("push_keys").select("public_key, private_key").maybeSingle();
    if (error) throw new Error(`Reading the push keys failed: ${error.message}`);
    return data ? { publicKey: data.public_key as string, privateKey: data.private_key as string } : null;
  };
  const existing = await read();
  if (existing) return existing;

  const made = webpush.generateVAPIDKeys();
  // If two requests race, the first one's keys win and both read them back.
  const { error } = await admin
    .from("push_keys")
    .upsert({ id: true, public_key: made.publicKey, private_key: made.privateKey }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`Saving the push keys failed: ${error.message}`);
  const saved = await read();
  if (!saved) throw new Error("The push keys couldn't be read back.");
  return saved;
}

type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };

// Sends one alert to every device that turned alerts on. A device the push
// service says is gone (404 or 410) is forgotten. Returns how many got it.
export async function sendToUser(admin: SupabaseClient, userId: string, payload: AlertPayload): Promise<number> {
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error) throw new Error(`Reading alert devices failed: ${error.message}`);
  if (!subs?.length) return 0;

  const keys = await pushKeys(admin);
  const body = JSON.stringify(payload);
  let sent = 0;
  for (const sub of subs as SubscriptionRow[]) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
        vapidDetails: { subject: subject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 60 * 60 * 24,
        urgency: "normal",
        topic: payload.tag,
      });
      sent += 1;
      await admin.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("id", sub.id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        // Only the status goes in the log: no addresses or keys.
        console.error("Sending an alert failed", { status: status ?? null });
      }
    }
  }
  return sent;
}

// Tells each person (or just the ones given) about transactions that came in
// since they were last told and still wait for review. Never throws: an alert
// that fails must not undo the sync or feed that called it.
export async function notifyNewToReview(admin: SupabaseClient, userIds?: string[]): Promise<void> {
  try {
    let query = admin.from("push_subscriptions").select("user_id, created_at");
    if (userIds) {
      if (!userIds.length) return;
      query = query.in("user_id", userIds);
    }
    const { data: subs, error } = await query;
    if (error) throw new Error(error.message);

    // Each person's first device's start time, in case they have no
    // push_state row yet.
    const firstSub = new Map<string, string>();
    for (const s of subs ?? []) {
      const prev = firstSub.get(s.user_id as string);
      if (!prev || (s.created_at as string) < prev) firstSub.set(s.user_id as string, s.created_at as string);
    }
    if (!firstSub.size) return;

    const { data: states, error: stateError } = await admin
      .from("push_state")
      .select("user_id, notified_until")
      .in("user_id", [...firstSub.keys()]);
    if (stateError) throw new Error(stateError.message);
    const since = new Map((states ?? []).map((s) => [s.user_id as string, s.notified_until as string]));

    for (const [userId, firstAt] of firstSub) {
      const from = since.get(userId) ?? firstAt;
      const { data: fresh, error: freshError } = await admin
        .from("transactions")
        .select("created_at")
        .eq("user_id", userId)
        .is("reviewed_at", null)
        .gt("created_at", from)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (freshError) throw new Error(freshError.message);
      if (!fresh?.length) continue;

      const { count, error: countError } = await admin
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("reviewed_at", null);
      if (countError) throw new Error(countError.message);

      // Moved forward first, so a slow push can't make the next run repeat it.
      const { error: saveError } = await admin
        .from("push_state")
        .upsert({ user_id: userId, notified_until: fresh[0].created_at }, { onConflict: "user_id" });
      if (saveError) throw new Error(saveError.message);

      await sendToUser(admin, userId, reviewAlert(fresh.length, count ?? fresh.length));
    }
  } catch (e) {
    console.error("Review alerts failed:", e instanceof Error ? e.message : e);
  }
}

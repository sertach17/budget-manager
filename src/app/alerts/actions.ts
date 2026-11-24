"use server";

import { headers } from "next/headers";
import { requireTwoFactorUser } from "@/lib/auth";
import { deviceLabel, isPushEndpoint, readSubscription, testAlert } from "@/lib/push/message";
import { pushKeys, sendToUser } from "@/lib/push/send";
import { createAdminClient } from "@/lib/supabase/admin";

export type AlertResult = { ok: boolean; message: string };

// The site's public push key, which the phone needs to turn alerts on.
export async function alertsPublicKey(): Promise<string | null> {
  await requireTwoFactorUser();
  try {
    return (await pushKeys(createAdminClient())).publicKey;
  } catch (e) {
    console.error("Push keys failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// Saves this phone so alerts can reach it. Transactions already waiting
// aren't announced, only ones that come in from now on.
export async function saveAlertDevice(subscription: unknown): Promise<AlertResult> {
  const { userId } = await requireTwoFactorUser();
  const sub = readSubscription(subscription);
  if (!sub) return { ok: false, message: "This browser sent something unexpected. Try again." };

  const admin = createAdminClient();
  const device = deviceLabel((await headers()).get("user-agent"));
  const { error } = await admin
    .from("push_subscriptions")
    .upsert(
      { user_id: userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, device },
      { onConflict: "endpoint" },
    );
  if (error) {
    console.error("Saving an alert device failed:", error.message);
    return { ok: false, message: "Couldn't turn alerts on. Try again in a minute." };
  }
  const { error: stateError } = await admin
    .from("push_state")
    .upsert({ user_id: userId, notified_until: new Date().toISOString() }, { onConflict: "user_id", ignoreDuplicates: true });
  if (stateError) console.error("Saving alert state failed:", stateError.message);
  return { ok: true, message: "Alerts are on for this device." };
}

// Forgets this phone.
export async function removeAlertDevice(endpoint: string): Promise<AlertResult> {
  const { userId } = await requireTwoFactorUser();
  if (!isPushEndpoint(endpoint)) return { ok: false, message: "That device couldn't be found." };
  const { error } = await createAdminClient().from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint);
  if (error) {
    console.error("Removing an alert device failed:", error.message);
    return { ok: false, message: "Couldn't turn alerts off. Try again." };
  }
  return { ok: true, message: "Alerts are off for this device." };
}

// Sends a test alert to every device you turned alerts on for.
export async function sendTestAlert(): Promise<AlertResult> {
  const { userId } = await requireTwoFactorUser();
  try {
    const sent = await sendToUser(createAdminClient(), userId, testAlert());
    return sent
      ? { ok: true, message: sent === 1 ? "Test sent. It should show in a few seconds." : `Test sent to ${sent} devices.` }
      : { ok: false, message: "No device has alerts on yet." };
  } catch (e) {
    console.error("Test alert failed:", e instanceof Error ? e.message : e);
    return { ok: false, message: "The test couldn't be sent. Try again in a minute." };
  }
}

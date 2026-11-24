// Plain helpers for phone alerts, kept apart from the server code so they
// can be tested.

// Push services a browser may hand us. The server only ever sends to these,
// so a saved address can't point it at anything else.
const PUSH_HOSTS = [
  /^web\.push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.port && !url.username && !url.password && PUSH_HOSTS.some((h) => h.test(url.hostname));
}

const KEY = /^[A-Za-z0-9_-]+={0,2}$/;

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

// Checks what the browser sent before it's saved.
export function readSubscription(value: unknown): PushSubscriptionInput | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const p256dh = v.keys?.p256dh;
  const auth = v.keys?.auth;
  if (!isPushEndpoint(v.endpoint)) return null;
  if (typeof p256dh !== "string" || p256dh.length < 20 || p256dh.length > 200 || !KEY.test(p256dh)) return null;
  if (typeof auth !== "string" || auth.length < 8 || auth.length > 100 || !KEY.test(auth)) return null;
  return { endpoint: v.endpoint, keys: { p256dh, auth } };
}

export type AlertPayload = { title: string; body: string; url: string; tag: string };

// What the phone shows. Only a count: no amounts or shop names, since the
// alert can show on a locked screen.
export function reviewAlert(newCount: number, totalToReview: number): AlertPayload {
  const what = newCount === 1 ? "1 new transaction" : `${newCount} new transactions`;
  const waiting = totalToReview > newCount ? ` ${totalToReview} are waiting in all.` : "";
  return { title: "Budget", body: `${what} to review.${waiting}`, url: "/", tag: "review" };
}

export function testAlert(): AlertPayload {
  return {
    title: "Budget",
    body: "Alerts are on. You'll hear from me when new transactions need review.",
    url: "/",
    tag: "test",
  };
}

// A short label for the device, from the browser's user agent.
export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent ?? "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows computer";
  return "Browser";
}

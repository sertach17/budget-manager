"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClass } from "../ui";

type Result = { ok: boolean; message: string };
type Status = "checking" | "needs-home-screen" | "unsupported" | "blocked" | "off" | "on";

function isApple() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
}

function openedFromHomeScreen() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function canPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// The push key comes as URL-safe base64; the browser wants bytes.
function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const sampleAlert = { body: "2 new transactions to review. (Demo alert, made up.)", icon: "/icon-192.png", tag: "demo" };

// The Phone alerts page: turns alerts on or off for this phone and sends a
// test. On an iPhone it only works from the home-screen app. The demo shows
// the same page, but its test alert is made up and nothing is saved.
export function AlertsView({
  demo = false,
  getPublicKey,
  onSave,
  onRemove,
  onTest,
}: {
  demo?: boolean;
  getPublicKey?: () => Promise<string | null>;
  onSave?: (subscription: PushSubscriptionJSON) => Promise<Result>;
  onRemove?: (endpoint: string) => Promise<Result>;
  onTest?: () => Promise<Result>;
}) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Result | null>(null);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const publicKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!canPush()) {
        const next: Status = isApple() && !openedFromHomeScreen() ? "needs-home-screen" : "unsupported";
        if (!cancelled) setStatus(next);
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        registration.current = reg;
        if (!demo && getPublicKey) publicKey.current = await getPublicKey();
        if (Notification.permission === "denied") {
          if (!cancelled) setStatus("blocked");
          return;
        }
        if (demo) {
          if (!cancelled) setStatus("off");
          return;
        }
        const sub = await reg.pushManager.getSubscription();
        // Saved again quietly, in case the server forgot this phone.
        if (sub && onSave) await onSave(sub.toJSON());
        if (!cancelled) setStatus(sub ? "on" : "off");
      } catch {
        if (!cancelled) setStatus("unsupported");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo, getPublicKey, onSave]);

  const turnOn = async () => {
    setBusy(true);
    setMessage(null);
    try {
      // Asked first, straight from the tap, as Safari requires.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        setMessage({ ok: false, message: "Alerts weren't allowed, so they're still off." });
        return;
      }
      const reg = registration.current ?? (await navigator.serviceWorker.ready);
      if (demo) {
        await reg.showNotification("Budget", sampleAlert);
        setStatus("on");
        setMessage({ ok: true, message: "This is what an alert looks like. In the demo nothing is saved." });
        return;
      }
      const key = publicKey.current ?? (getPublicKey ? await getPublicKey() : null);
      if (!key) {
        setMessage({ ok: false, message: "Alerts aren't ready on the site yet. Try again in a minute." });
        return;
      }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      const saved = onSave ? await onSave(sub.toJSON()) : { ok: false, message: "Can't save here." };
      if (!saved.ok) await sub.unsubscribe();
      setStatus(saved.ok ? "on" : "off");
      setMessage(saved);
    } catch {
      setMessage({ ok: false, message: "This phone couldn't turn alerts on. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const reg = registration.current ?? (await navigator.serviceWorker.ready);
      const sub = demo ? null : await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        if (onRemove) await onRemove(sub.endpoint);
      }
      setStatus("off");
      setMessage({ ok: true, message: "Alerts are off for this device." });
    } catch {
      setMessage({ ok: false, message: "Couldn't turn alerts off. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (demo) {
        const reg = registration.current ?? (await navigator.serviceWorker.ready);
        await reg.showNotification("Budget", sampleAlert);
        setMessage({ ok: true, message: "Sample alert shown." });
      } else if (onTest) {
        setMessage(await onTest());
      }
    } catch {
      setMessage({ ok: false, message: "The test couldn't be sent. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-line bg-white/[0.03] p-4 animate-rise">
      <h2 className="font-semibold">This device</h2>

      {status === "checking" ? <p className="mt-2 text-sm text-white/60">Checking…</p> : null}

      {status === "needs-home-screen" ? (
        <div className="mt-2 text-sm text-white/70">
          <p>On an iPhone, alerts only work in the Budget app on your home screen (iOS 16.4 or later).</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              In Safari, tap <span className="font-medium text-white">Share</span>, then{" "}
              <span className="font-medium text-white">Add to Home Screen</span>, if Budget isn&apos;t there yet.
            </li>
            <li>Open Budget from the home screen.</li>
            <li>
              Come back here (Settings, then <span className="font-medium text-white">Phone alerts</span>) and tap{" "}
              <span className="font-medium text-white">Turn on alerts</span>.
            </li>
          </ol>
        </div>
      ) : null}

      {status === "unsupported" ? (
        <p className="mt-2 text-sm text-white/70">This browser can&apos;t show alerts from websites.</p>
      ) : null}

      {status === "blocked" ? (
        <p className="mt-2 text-sm text-white/70">
          Alerts are blocked for Budget. On an iPhone, open <span className="font-medium text-white">Settings</span>, then{" "}
          <span className="font-medium text-white">Notifications</span>, then <span className="font-medium text-white">Budget</span>, and
          turn on Allow Notifications.
        </p>
      ) : null}

      {status === "off" ? (
        <>
          <p className="mt-1 text-sm text-white/60">
            Get a notification when new transactions come in from your banks, Apple Wallet or Venmo and wait for review.
          </p>
          <button type="button" onClick={turnOn} disabled={busy} className={`${buttonClass} mt-4`}>
            {busy ? "Turning on…" : "Turn on alerts"}
          </button>
        </>
      ) : null}

      {status === "on" ? (
        <>
          <p className="mt-1 text-sm text-emerald-300">Alerts are on.</p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={test} disabled={busy} className={buttonClass}>
              Send a test
            </button>
            <button
              type="button"
              onClick={turnOff}
              disabled={busy}
              className="pressable w-full rounded-xl border border-line px-3 py-2.5 font-medium hover:bg-white/[0.06] disabled:opacity-50"
            >
              Turn off
            </button>
          </div>
        </>
      ) : null}

      {message ? (
        <p role="status" className={`mt-3 text-sm ${message.ok ? "text-white/70" : "text-red-400"}`}>
          {message.message}
        </p>
      ) : null}
    </section>
  );
}

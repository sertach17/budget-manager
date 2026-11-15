"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buttonClass, ErrorText, inputClass } from "../ui";

function CodeForm({ factorId, label }: { factorId: string; label: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your app.");

    setPending(true);
    setError(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
    setPending(false);
    if (error) return setError("That code didn't work. Wait for a new one and try again.");
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm">{label}</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          className={`${inputClass} tracking-[0.3em]`}
        />
      </label>
      <ErrorText message={error} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Checking…" : "Verify"}
      </button>
    </form>
  );
}

// Already has an authenticator app: ask for today's code.
export function VerifyCode({ factorId }: { factorId: string }) {
  return <CodeForm factorId={factorId} label="6-digit code from your authenticator app" />;
}

// No authenticator app yet: show a QR code to scan, then confirm one code.
export function EnrollApp() {
  const started = useRef(false);
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const supabase = createClient();
      // Clear any half-finished setup from an earlier visit.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator app",
        issuer: "Budget Manager",
      });
      if (error || !data) return setError("Couldn't start two-factor setup. Reload the page.");
      setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, []);

  if (error) return <ErrorText message={error} />;
  if (!factor) return <p className="text-sm">Getting your QR code…</p>;

  return (
    <div className="space-y-5">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-black/70 dark:text-white/70">
        <li>Open an authenticator app (Google Authenticator, 1Password, Authy…).</li>
        <li>Scan this code, or type the key under it.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URI from Supabase */}
      <img src={factor.qr} alt="QR code for your authenticator app" className="mx-auto size-48 rounded bg-white p-2" />
      <p className="break-all text-center font-mono text-xs">{factor.secret}</p>
      <CodeForm factorId={factor.id} label="6-digit code" />
    </div>
  );
}

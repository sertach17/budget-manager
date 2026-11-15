"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buttonClass, ErrorText, inputClass } from "../../ui";

const MIN_LENGTH = 12;

export function PasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError("The two passwords don't match.");

    setPending(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({ password });
    setPending(false);
    if (error) return setError(error.message);
    // Next: set up (or confirm) the authenticator app.
    router.replace("/mfa");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm">New password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          required
          className={inputClass}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Type it again</span>
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          required
          className={inputClass}
        />
      </label>
      <ErrorText message={error} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}

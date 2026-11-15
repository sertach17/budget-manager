"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";
import { buttonClass, ErrorText, inputClass } from "../ui";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm">Email</span>
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </label>
      <ErrorText message={state.error} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

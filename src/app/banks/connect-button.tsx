"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { usePlaidLink } from "react-plaid-link";
import { buttonClass, ErrorText } from "../ui";
import { connectBank, createLinkToken } from "./actions";

function PlaidLinkOpener({ token, onDone }: { token: string; onDone: (message: string, ok: boolean) => void }) {
  const router = useRouter();
  const { open, ready } = usePlaidLink({
    token,
    onSuccess: async (publicToken) => {
      if (!publicToken) {
        onDone("Plaid didn't return a connection. Try again.", false);
        return;
      }
      const result = await connectBank(publicToken);
      onDone(result.message ?? "Connected.", result.ok);
      router.refresh();
    },
    onExit: () => onDone("", true),
  });

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  return null;
}

// Opens Plaid Link so you can sign in to your bank on Plaid's own screen.
// Your bank password goes to Plaid, never to this app.
export function ConnectBankButton() {
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <button
        type="button"
        className={buttonClass}
        disabled={pending || token !== null}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await createLinkToken();
            if (result.ok) setToken(result.token);
            else setMessage({ text: result.message, ok: false });
          })
        }
      >
        {pending || token ? "Opening Plaid…" : "Connect a bank"}
      </button>
      {token ? (
        <PlaidLinkOpener
          token={token}
          onDone={(text, ok) => {
            setToken(null);
            setMessage(text ? { text, ok } : null);
          }}
        />
      ) : null}
      {message ? (
        message.ok ? (
          <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{message.text}</p>
        ) : (
          <div className="mt-3">
            <ErrorText message={message.text} />
          </div>
        )
      ) : null}
    </div>
  );
}

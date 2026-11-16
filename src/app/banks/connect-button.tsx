"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { usePlaidLink } from "react-plaid-link";
import { buttonClass, ErrorText } from "../ui";
import { connectBank, createLinkToken, syncBank } from "./actions";

function PlaidLinkOpener({
  token,
  onSuccess,
  onDone,
}: {
  token: string;
  onSuccess: (publicToken: string | null) => Promise<{ ok: boolean; message?: string }>;
  onDone: (message: string, ok: boolean) => void;
}) {
  const router = useRouter();
  const { open, ready } = usePlaidLink({
    token,
    onSuccess: async (publicToken) => {
      const result = await onSuccess(publicToken);
      onDone(result.message ?? "Done.", result.ok);
      router.refresh();
    },
    onExit: () => onDone("", true),
  });

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  return null;
}

async function connectNew(publicToken: string | null) {
  if (!publicToken) return { ok: false, message: "Plaid didn't return a connection. Try again." };
  return connectBank(publicToken);
}

function Message({ message }: { message: { text: string; ok: boolean } | null }) {
  if (!message) return null;
  return message.ok ? (
    <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{message.text}</p>
  ) : (
    <div className="mt-3">
      <ErrorText message={message.text} />
    </div>
  );
}

// For a bank that needs you to sign in again: opens Plaid on that bank,
// then syncs it. The connection and its history stay as they are.
export function FixBankButton({ itemId, bank }: { itemId: string; bank: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <button
        type="button"
        className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        disabled={pending || token !== null}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await createLinkToken(itemId);
            if (result.ok) setToken(result.token);
            else setMessage({ text: result.message, ok: false });
          })
        }
      >
        {pending || token ? "Opening Plaid…" : `Sign in to ${bank} again`}
      </button>
      {token ? (
        <PlaidLinkOpener
          token={token}
          onSuccess={() => syncBank(itemId)}
          onDone={(text, ok) => {
            setToken(null);
            setMessage(text ? { text, ok } : null);
          }}
        />
      ) : null}
      <Message message={message} />
    </div>
  );
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
          onSuccess={connectNew}
          onDone={(text, ok) => {
            setToken(null);
            setMessage(text ? { text, ok } : null);
          }}
        />
      ) : null}
      <Message message={message} />
    </div>
  );
}

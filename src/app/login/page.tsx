import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, ErrorText } from "../ui";
import { EmailLinkHandler } from "./email-link";
import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Sign in · Budget Manager" };

async function LinkError({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { error } = await searchParams;
  if (error !== "link") return null;
  return (
    <div className="mb-4">
      <ErrorText message="That email link has expired or was already used. Ask for a new one." />
    </div>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Card title="Sign in">
      <EmailLinkHandler />
      <Suspense fallback={null}>
        <LinkError searchParams={searchParams} />
      </Suspense>
      <LoginForm />
      <Link
        href="/demo"
        className="mt-3 block w-full rounded-lg border border-black/15 px-3 py-2 text-center font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        Try the demo
      </Link>
      <p className="mt-6 text-xs text-black/50 dark:text-white/50">
        Accounts are by invitation only. The demo uses made-up data.
      </p>
    </Card>
  );
}

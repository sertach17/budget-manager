import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, ErrorText } from "../ui";
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
      <Suspense fallback={null}>
        <LinkError searchParams={searchParams} />
      </Suspense>
      <LoginForm />
      <p className="mt-6 text-xs text-black/50 dark:text-white/50">
        Accounts are by invitation only.
      </p>
    </Card>
  );
}

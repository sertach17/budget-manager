import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "../../ui";
import { PasswordForm } from "./form";

export const metadata: Metadata = { title: "Choose a password · Budget Manager" };

async function SignedInAs() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return (
    <p className="mb-4 text-sm text-black/60 dark:text-white/60">
      Signed in as {String(data.claims.email ?? "")}.
    </p>
  );
}

export default function PasswordPage() {
  return (
    <Card title="Choose a password">
      <Suspense fallback={<p className="mb-4 h-5" />}>
        <SignedInAs />
      </Suspense>
      <PasswordForm />
    </Card>
  );
}

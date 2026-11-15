import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "../ui";
import { EnrollApp, VerifyCode } from "./two-factor";

export const metadata: Metadata = { title: "Two-factor · Budget Manager" };

async function TwoFactorStep() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect("/");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp.find((f) => f.status === "verified");

  return totp ? <VerifyCode factorId={totp.id} /> : <EnrollApp />;
}

export default function MfaPage() {
  return (
    <Card title="Two-factor check">
      <Suspense fallback={<p className="text-sm">Loading…</p>}>
        <TwoFactorStep />
      </Suspense>
    </Card>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { requireTwoFactorUser } from "@/lib/auth";
import { AppHeader } from "../app-header";
import { StatementUpload } from "./statement-upload";

export const metadata: Metadata = { title: "Upload a statement · Budget Manager" };

async function Upload({ searchParams }: { searchParams: Promise<{ account?: string | string[] }> }) {
  const { account } = await searchParams;
  const { supabase } = await requireTwoFactorUser();
  // Only your own accounts take uploads; linked banks fill in by themselves.
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, type, mask")
    .in("source", ["manual", "upload"])
    .order("created_at");
  if (error) return <p className="mt-8 text-sm text-red-600 dark:text-red-400">Your accounts couldn&apos;t load. Try again in a minute.</p>;
  return <StatementUpload accounts={data ?? []} initialAccountId={typeof account === "string" ? account : undefined} />;
}

export default function UploadPage({ searchParams }: { searchParams: Promise<{ account?: string | string[] }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <AppHeader />
      <h1 className="mt-6 text-xl font-semibold">Upload a statement</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Add the transactions from a file you download, like an Apple Card export, to one of your own accounts.
      </p>
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <Upload searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

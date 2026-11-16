import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoUpload } from "../demo-pages";

export const metadata: Metadata = { title: "Upload a statement · Budget Manager demo" };

export default function Page() {
  // useSearchParams needs a Suspense boundary of its own.
  return (
    <Suspense fallback={<p className="text-sm">Loading…</p>}>
      <DemoUpload />
    </Suspense>
  );
}

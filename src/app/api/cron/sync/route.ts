import { timingSafeEqual } from "node:crypto";
import { isPlaidConfigured } from "@/lib/plaid/client";
import { syncBanks } from "@/lib/plaid/sync-all";
import { createAdminClient } from "@/lib/supabase/admin";

// The morning bank sync. Vercel calls this once a day (see vercel.json) and
// sends CRON_SECRET, so nobody else can start it.
export const maxDuration = 60;

function fromVercelCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const sent = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return sent.length === expected.length && timingSafeEqual(sent, expected);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return Response.json({ error: "CRON_SECRET isn't set in Vercel." }, { status: 503 });
  if (!fromVercelCron(request)) return Response.json({ error: "Not allowed." }, { status: 401 });
  if (!isPlaidConfigured()) return Response.json({ error: "Plaid isn't set up." }, { status: 503 });

  try {
    const results = await syncBanks(createAdminClient());
    const failed = results.filter((r) => !r.ok).length;
    console.log("Morning sync", { banks: results.length, failed });
    // Only counts and codes go back: no names, amounts or ids.
    return Response.json({ banks: results.length, failed, codes: results.flatMap((r) => (r.code ? [r.code] : [])) });
  } catch (error) {
    console.error("Morning sync failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "The sync couldn't start." }, { status: 500 });
  }
}

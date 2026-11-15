import "server-only";
import { dkimVerify } from "mailauth/lib/dkim/verify";

// Which domain really sent this email, judged by its DKIM signature: the
// sender's server signs the From line and body with a key published in DNS,
// so a forged "From: venmo@venmo.com" fails. Gmail's forwarding keeps the
// original signature intact. Returns the From domain when a passing
// signature from that same domain covers it, otherwise null.
const TRUSTED = new Set(["venmo.com", "google.com"]);

type Resolver = NonNullable<Parameters<typeof dkimVerify>[1]>["resolver"];

export async function verifiedSenderDomain(
  raw: Buffer,
  resolver?: Resolver,
): Promise<{ domain: string | null; from: string | null; signedTo: boolean; detail: string }> {
  const result = await dkimVerify(raw, resolver ? { resolver } : undefined);
  const from = (result.headerFrom?.[0] ?? "").toLowerCase() || null;
  const fromDomain = from?.split("@").pop() ?? null;

  for (const signature of result.results ?? []) {
    const status = signature.status;
    if (status?.result !== "pass") continue;
    // Signed by the From line's own domain (DMARC alignment), and the whole
    // body is covered (no l= tag leaving room for extra text).
    if (!fromDomain || status.aligned !== fromDomain) continue;
    if (signature.canonBodyLengthLimited) continue;
    // Whether the To line was signed too, so a real Venmo email sent to
    // somebody else can't be passed off as one of yours.
    const keys = signature.signingHeaders?.keys ?? [];
    const signedTo = (typeof keys === "string" ? keys.split(":") : keys).some((k: string) => k.trim().toLowerCase() === "to");
    if (TRUSTED.has(fromDomain)) return { domain: fromDomain, from, signedTo, detail: signature.info ?? "dkim=pass" };
  }

  const first = result.results?.[0];
  return { domain: null, from, signedTo: false, detail: (first?.info ?? "no DKIM signature").slice(0, 300) };
}

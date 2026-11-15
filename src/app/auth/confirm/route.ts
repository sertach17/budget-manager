import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Links in Supabase's invite and password-reset emails land here:
//   /auth/confirm?token_hash=...&type=invite|recovery
// A valid link signs the person in, then they choose a password.
const ALLOWED_TYPES: EmailOtpType[] = ["invite", "recovery", "email"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const done = request.nextUrl.clone();
  done.search = "";

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      done.pathname = type === "email" ? "/" : "/account/password";
      return NextResponse.redirect(done);
    }
  }

  done.pathname = "/login";
  done.searchParams.set("error", "link");
  return NextResponse.redirect(done);
}

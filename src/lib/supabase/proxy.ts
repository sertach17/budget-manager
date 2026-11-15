import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

// Pages anyone can open without signing in.
const PUBLIC_PATHS = ["/login", "/auth/confirm"];
// Open to everyone, signed in or not, with no session check: the demo shows
// only made-up data, and the Venmo inbox endpoint checks each email's
// signature itself.
const NO_SESSION_PATHS = ["/demo", "/api/venmo/inbound"];
// Pages a signed-in user can open before finishing two-factor setup.
const SETUP_PATHS = ["/mfa", "/account/password"];

function matches(pathname: string, paths: string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function redirectTo(request: NextRequest, pathname: string, from: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const response = NextResponse.redirect(url);
  // Keep any refreshed session cookies on the redirect.
  from.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

// Runs before every page: refreshes the Supabase session cookie and sends
// people to the right place.
//   - Anyone: the demo page (made-up data only) and the Venmo inbox endpoint.
//   - Not signed in: only the login page.
//   - Signed in with a password but no two-factor code yet: only the
//     two-factor page (and the set-password page before two-factor exists).
//   - Signed in with two-factor (aal2): everything.
export async function updateSession(request: NextRequest) {
  if (matches(request.nextUrl.pathname, NO_SESSION_PATHS)) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getClaims() checks the session's signature; don't run code between
  // creating the client and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!signedIn) {
    return matches(pathname, PUBLIC_PATHS) ? response : redirectTo(request, "/login", response);
  }

  if (matches(pathname, ["/auth/confirm"])) return response;

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const fullySignedIn = aal?.currentLevel === "aal2";
  const hasTwoFactor = aal?.nextLevel === "aal2";

  if (fullySignedIn) {
    return pathname === "/login" ? redirectTo(request, "/", response) : response;
  }
  if (hasTwoFactor) {
    // Has an authenticator app set up but hasn't entered a code this session.
    return pathname === "/mfa" ? response : redirectTo(request, "/mfa", response);
  }
  // Signed in but no two-factor yet: finish setup first.
  return matches(pathname, SETUP_PATHS) ? response : redirectTo(request, "/mfa", response);
}

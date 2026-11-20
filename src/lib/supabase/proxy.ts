import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

// Pages anyone can open without signing in.
const PUBLIC_PATHS = ["/login", "/auth/confirm"];
// Open to everyone, signed in or not, with no session check: the demo shows
// only made-up data, the Venmo inbox endpoint checks each email's signature
// itself, and the agent connection checks each agent's own token.
const NO_SESSION_PATHS = ["/demo", "/api/venmo/inbound", "/api/wallet", "/api/mcp", "/api/cron", "/.well-known"];

// When an AI agent sends you to approve it but you aren't signed in yet, the
// approval page is kept here so you land back on it after two-factor.
const RETURN_COOKIE = "after_sign_in";
const CONSENT_PAGE = /^\/oauth\/consent\?authorization_id=[A-Za-z0-9_-]{1,100}$/;
// Pages a signed-in user can open before finishing two-factor setup.
const SETUP_PATHS = ["/mfa", "/account/password"];

function matches(pathname: string, paths: string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function redirectTo(request: NextRequest, path: string, from: NextResponse) {
  const url = request.nextUrl.clone();
  const [pathname, query] = path.split("?");
  url.pathname = pathname;
  url.search = query ? `?${query}` : "";
  const response = NextResponse.redirect(url);
  // Keep any refreshed session cookies on the redirect.
  from.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

// Keeps the agent approval page for after sign-in, for 15 minutes.
function remember(response: NextResponse, consentPage: string | null) {
  if (consentPage) {
    response.cookies.set(RETURN_COOKIE, consentPage, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 900 });
  }
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

  const { pathname, search } = request.nextUrl;
  const consentPage = pathname === "/oauth/consent" && CONSENT_PAGE.test(`${pathname}${search}`) ? `${pathname}${search}` : null;

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

  if (!signedIn) {
    if (matches(pathname, PUBLIC_PATHS)) return response;
    return remember(redirectTo(request, "/login", response), consentPage);
  }

  if (matches(pathname, ["/auth/confirm"])) return response;

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const fullySignedIn = aal?.currentLevel === "aal2";
  const hasTwoFactor = aal?.nextLevel === "aal2";

  if (fullySignedIn) {
    // Back to the agent approval page you started from, if any.
    const saved = request.cookies.get(RETURN_COOKIE)?.value;
    if (saved && (pathname === "/" || pathname === "/login")) {
      const back = CONSENT_PAGE.test(saved) ? redirectTo(request, saved, response) : redirectTo(request, "/", response);
      back.cookies.delete(RETURN_COOKIE);
      return back;
    }
    return pathname === "/login" ? redirectTo(request, "/", response) : response;
  }
  if (hasTwoFactor) {
    // Has an authenticator app set up but hasn't entered a code this session.
    return pathname === "/mfa" ? response : remember(redirectTo(request, "/mfa", response), consentPage);
  }
  // Signed in but no two-factor yet: finish setup first.
  return matches(pathname, SETUP_PATHS) ? response : redirectTo(request, "/mfa", response);
}

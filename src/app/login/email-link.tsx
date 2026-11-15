"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// Supabase's default invite and password-reset emails (used until custom SMTP
// is set up) send people back to the Site URL with the session in the URL
// fragment: #access_token=...&refresh_token=...&type=invite
// The fragment never reaches the server, so the proxy sends the visitor here
// to /login with it intact, and this picks it up in the browser.
export function EmailLinkHandler() {
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const type = hash.get("type");
    if (!accessToken || !refreshToken) return;

    // Drop the tokens from the address bar and history right away.
    window.history.replaceState(null, "", window.location.pathname);
    (async () => {
      const { error } = await createClient().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        router.replace("/login?error=link");
        return;
      }
      router.replace(type === "invite" || type === "recovery" ? "/account/password" : "/mfa");
      router.refresh();
    })();
  }, [router]);

  return null;
}

// Cloudflare Email Worker for venmo@torrezhq.com.
//
// Cloudflare Email Routing hands every email sent to that address to this
// worker, which passes the raw email on to the budget app. The app checks
// Venmo's DKIM signature itself, so this worker holds no secrets.
//
// Set up in the Cloudflare dashboard: Workers & Pages -> Create -> paste this
// file, then Email -> Email Routing -> Routing rules -> venmo@torrezhq.com ->
// Send to a Worker -> this worker.

const ENDPOINT = "https://budget.torrezhq.com/api/venmo/inbound";
const MAX_BYTES = 2 * 1024 * 1024;

const worker = {
  async email(message) {
    if (message.rawSize > MAX_BYTES) {
      message.setReject("Email too large");
      return;
    }
    const raw = await new Response(message.raw).arrayBuffer();

    // Try twice, in case the app is briefly unreachable.
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "content-type": "message/rfc822", "x-envelope-to": message.to },
          body: raw,
        });
        if (response.ok || response.status < 500) break;
      } catch {
        response = undefined;
      }
    }

    // Bounce it if the app couldn't take it, so it isn't lost without a trace.
    if (!response || !response.ok) {
      message.setReject(`Budget app couldn't take this email (${response ? response.status : "no answer"})`);
    }
  },
};

export default worker;

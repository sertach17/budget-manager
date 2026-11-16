import { getPublicOrigin, metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { supabaseEnv } from "@/lib/supabase/env";

// Tells an AI agent where to sign in for /api/mcp: Supabase's OAuth server.
// Answers at /.well-known/oauth-protected-resource and at
// /.well-known/oauth-protected-resource/api/mcp, since agents try either.

function handler(req: Request) {
  const { url } = supabaseEnv();
  const origin = getPublicOrigin(req);
  return protectedResourceHandler({
    authServerUrls: [`${url}/auth/v1`],
    resourceUrl: `${origin}/api/mcp`,
  })(req);
}

const options = metadataCorsOptionsRequestHandler();

export { handler as GET, options as OPTIONS };

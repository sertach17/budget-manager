import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyAgentToken } from "@/lib/agent/session";
import { registerAgentTools } from "@/lib/agent/tools";

// The MCP connection AI agents use. An agent has to sign in with your login
// and two-factor through Supabase's OAuth server, and you approve it on the
// consent page, before any tool runs. Without a valid token this answers 401
// and points the agent at /.well-known/oauth-protected-resource.

const handler = createMcpHandler(
  (server) => {
    registerAgentTools(server);
  },
  {
    serverInfo: { name: "Budget Manager", version: "1.0.0" },
    instructions:
      "Sergio's Budget Manager: accounts, transactions, budgets, income, goals and Pending to review. " +
      "Amounts below 0 are money out. Dates are in Eastern time. Nothing here can delete data or change bank links.",
  },
);

const authed = withMcpAuth(handler, (_req, token) => verifyAgentToken(token), {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

export { authed as GET, authed as POST, authed as DELETE };

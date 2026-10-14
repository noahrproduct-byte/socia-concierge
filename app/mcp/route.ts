import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { registerTools, SERVER_INSTRUCTIONS } from "@/lib/mcp/tools";
import { verifyAccessToken } from "@/lib/oauth/server";
import { appOrigin, mcpResource, SCOPE_READ } from "@/lib/oauth/config";
import { CORS_HEADERS, oauthStore, preflight } from "@/lib/oauth/runtime";

export const runtime = "nodejs";
export const maxDuration = 60;

// https://sociaos.com/mcp: SOCIA's MCP server (Streamable HTTP; the
// 2026-07-28 revision natively, earlier stateless clients through the SDK's
// fallback). Every request needs a SOCIA access token issued for this
// endpoint by SOCIA's own OAuth server; anything else gets a 401 pointing at
// the protected resource metadata so the client can start the sign-in.
const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "SOCIA", version: "1.0.0" },
  instructions: SERVER_INSTRUCTIONS,
});

async function verify(_req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  const store = oauthStore();
  if (!store || !bearer) return undefined;
  const p = await verifyAccessToken(store, bearer, new Date()).catch(() => null);
  if (!p) return undefined;
  return { token: bearer, clientId: p.clientId, scopes: p.scopes, expiresAt: p.expiresAt, resource: new URL(mcpResource()), extra: { principal: p } };
}

const authed = withMcpAuth(handler, verify, {
  required: true,
  requiredScopes: [SCOPE_READ],
  resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp",
  resourceUrl: appOrigin(),
});

async function serve(req: Request): Promise<Response> {
  const res = await authed(req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export { serve as GET, serve as POST, serve as DELETE };
export const OPTIONS = preflight;

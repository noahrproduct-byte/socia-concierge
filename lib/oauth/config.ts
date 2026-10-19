// SOCIA's OAuth 2.1 authorization server for AI assistants (MCP clients):
// the fixed identifiers and lifetimes every other file reads. The issuer is
// the canonical site origin (https://sociaos.com in production), and the only
// protected resource is the MCP endpoint on that origin.

/** What an assistant may be granted. */
export const SCOPE_READ = "socia:read";
/** Never granted: kept so a client that still asks for it isn't refused (it gets read, and publishing if the person ticks it). */
export const SCOPE_DRAFTS = "socia:drafts";
/** Create, schedule and publish posts. Granted only when the person ticks it on SOCIA's consent screen or in Settings. */
export const SCOPE_PUBLISH = "socia:publish";
export const SUPPORTED_SCOPES = [SCOPE_READ, SCOPE_DRAFTS, SCOPE_PUBLISH] as const;
/** Scopes an app gets from its request alone. Publishing is never among them: only the person's own choice adds it. */
export const GRANTABLE_SCOPES: readonly string[] = [SCOPE_READ];
/**
 * Scopes read from the connection at every call rather than from the token, so
 * switching publishing on or off in Settings takes effect at once without the
 * app having to connect again.
 */
export const CONNECTION_SCOPES: readonly string[] = [SCOPE_PUBLISH];
/** OpenID scopes some clients add by default; SOCIA isn't an OpenID provider, so they are ignored, not refused. */
export const IGNORED_SCOPES = ["openid", "email", "profile", "offline_access"];

export const SCOPE_LABEL: Record<string, string> = {
  [SCOPE_READ]: "Read your analytics, posts, plans and recommendations",
  [SCOPE_DRAFTS]: "Create and edit drafts",
  [SCOPE_PUBLISH]: "Create, schedule and publish posts to your connected accounts",
};

export const ACCESS_TTL_S = 60 * 60;
export const REFRESH_TTL_S = 30 * 24 * 60 * 60;
export const CODE_TTL_S = 10 * 60;
export const REQUEST_TTL_S = 15 * 60;
/** Client metadata documents are re-read after this long. */
export const CIMD_TTL_S = 24 * 60 * 60;

export const ACCESS_PREFIX = "socia_at_";
export const REFRESH_PREFIX = "socia_rt_";
export const CODE_PREFIX = "socia_ac_";

/** The site origin with no trailing slash. */
export function appOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  return env || "https://sociaos.com";
}

export const issuer = () => appOrigin();
export const mcpResource = () => `${appOrigin()}/mcp`;
export const protectedResourceMetadataUrl = () => `${appOrigin()}/.well-known/oauth-protected-resource/mcp`;

/** The resource indicator a client sent names this MCP server (scheme and host case-insensitive, trailing slash ignored). */
export function isOurResource(resource: string | null | undefined): boolean {
  if (!resource) return true;
  try {
    const a = new URL(resource);
    const b = new URL(mcpResource());
    if (a.hash) return false;
    const path = (u: URL) => u.pathname.replace(/\/+$/, "") || "/";
    return a.protocol === b.protocol && a.host.toLowerCase() === b.host.toLowerCase() && path(a) === path(b);
  } catch {
    return false;
  }
}

export function authorizationServerMetadata() {
  const iss = issuer();
  return {
    issuer: iss,
    authorization_endpoint: `${iss}/oauth/authorize`,
    token_endpoint: `${iss}/oauth/token`,
    registration_endpoint: `${iss}/oauth/register`,
    revocation_endpoint: `${iss}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...SUPPORTED_SCOPES],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${iss}/settings#ai-assistants`,
  };
}

export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [issuer()],
    scopes_supported: [SCOPE_READ, SCOPE_PUBLISH],
    bearer_methods_supported: ["header"],
    resource_name: "SOCIA",
    resource_documentation: `${issuer()}/settings#ai-assistants`,
  };
}

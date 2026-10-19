import { describe, it, expect, beforeEach } from "vitest";
import { createConsentRequest, decide, revokeToken, token, validateAuthorize, verifyAccessToken, redirectWith } from "./server";
import { memoryStore, type OAuthStore } from "./store";
import { fetchClientMetadata, isAllowedRedirectUri, isPrivateAddress, redirectMatches, validateRegistration } from "./clients";
import { s256, verifyPkce } from "./tokens";
import { authorizationServerMetadata, isOurResource, mcpResource, protectedResourceMetadata } from "./config";

const NOW = new Date("2026-10-14T12:00:00Z");
const at = (s: number) => new Date(NOW.getTime() + s * 1000);
const VERIFIER = "a".repeat(20) + "B".repeat(23) + "-._~";
const CHALLENGE = s256(VERIFIER);
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

let store: ReturnType<typeof memoryStore>;
beforeEach(async () => {
  store = memoryStore();
  await store.putClient({ clientId: "dcr-1", kind: "dcr", clientName: "Claude", clientUri: null, logoUri: null, redirectUris: [REDIRECT, "http://localhost/callback"], fetchedAt: null });
});

const params = (over: Record<string, string | undefined> = {}) => ({
  client_id: "dcr-1", redirect_uri: REDIRECT, response_type: "code", code_challenge: CHALLENGE, code_challenge_method: "S256",
  state: "st-1", scope: "socia:read", resource: mcpResource(), ...over,
});

/** Authorize, consent and exchange: a full connection. */
async function connect(s: OAuthStore = store, opts: { workspaces?: string[]; publish?: boolean; scope?: string } = {}) {
  const a = await validateAuthorize(s, params(opts.scope ? { scope: opts.scope } : {}), NOW);
  if (a.kind !== "ok") throw new Error(a.kind);
  const reqId = await createConsentRequest(s, "user-1", a, NOW);
  const d = await decide(s, { requestId: reqId, userId: "user-1", allow: true, workspaceIds: opts.workspaces ?? ["ws-1"], allowPublish: opts.publish, accessibleWorkspaceIds: ["ws-1", "ws-2"] }, NOW);
  if (!d.ok) throw new Error(d.message);
  const code = new URL(d.url).searchParams.get("code")!;
  const t = await token(s, new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: "dcr-1", code_verifier: VERIFIER, resource: mcpResource() }), NOW);
  return { d, code, t };
}

describe("metadata", () => {
  it("advertises the issuer, PKCE S256, public clients, CIMD, DCR and iss", () => {
    const m = authorizationServerMetadata();
    expect(m.issuer).toBe("https://sociaos.com");
    expect(m.code_challenge_methods_supported).toEqual(["S256"]);
    expect(m.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(m.client_id_metadata_document_supported).toBe(true);
    expect(m.authorization_response_iss_parameter_supported).toBe(true);
    expect(m.registration_endpoint).toBe("https://sociaos.com/oauth/register");
  });
  it("describes the MCP endpoint as the only protected resource", () => {
    expect(protectedResourceMetadata()).toMatchObject({ resource: "https://sociaos.com/mcp", authorization_servers: ["https://sociaos.com"], scopes_supported: ["socia:read", "socia:publish"] });
    expect(isOurResource("https://SOCIAOS.com/mcp/")).toBe(true);
    expect(isOurResource("https://sociaos.com/other")).toBe(false);
    expect(isOurResource("https://evil.example/mcp")).toBe(false);
    expect(isOurResource(null)).toBe(true);
  });
});

describe("client rules", () => {
  it("allows https and loopback redirects only", () => {
    expect(isAllowedRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:3118/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://evil.example/callback")).toBe(false);
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectUri("https://x.example/cb#frag")).toBe(false);
    expect(isAllowedRedirectUri("cursor://callback")).toBe(false);
  });
  it("matches redirects exactly, except a loopback port", () => {
    expect(redirectMatches([REDIRECT], REDIRECT)).toBe(true);
    expect(redirectMatches([REDIRECT], `${REDIRECT}/x`)).toBe(false);
    expect(redirectMatches(["http://localhost/callback"], "http://localhost:51234/callback")).toBe(true);
    expect(redirectMatches(["http://localhost/callback"], "http://localhost:51234/other")).toBe(false);
  });
  it("registers public clients only, with valid redirects", () => {
    expect(validateRegistration({ client_name: "Claude", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" }).ok).toBe(true);
    expect(validateRegistration({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" }).ok).toBe(false);
    expect(validateRegistration({ redirect_uris: [] }).ok).toBe(false);
    expect(validateRegistration({ redirect_uris: ["http://evil.example/cb"] }).ok).toBe(false);
    expect(validateRegistration({ redirect_uris: [REDIRECT], grant_types: ["client_credentials"] }).ok).toBe(false);
    expect(validateRegistration({ redirect_uris: [REDIRECT], grant_types: "authorization_code" }).ok).toBe(false);
  });
  it("accepts Claude's metadata document, ignoring the grant types SOCIA doesn't use", async () => {
    // Served at https://claude.ai/oauth/mcp-oauth-client-metadata (fetched 2026-10-19).
    const url = "https://claude.ai/oauth/mcp-oauth-client-metadata";
    const doc = { client_id: url, client_name: "Claude", client_uri: "https://claude.ai", redirect_uris: [REDIRECT], grant_types: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:jwt-bearer"], response_types: ["code"], token_endpoint_auth_method: "none" };
    const r = await fetchClientMetadata(url, { resolve: async () => ["160.79.104.10"], fetch: async () => new Response(JSON.stringify(doc)) });
    expect(r).toEqual({ ok: true, metadata: { clientName: "Claude", clientUri: "https://claude.ai/", logoUri: null, redirectUris: [REDIRECT] } });
  });
  it("never treats private or loopback addresses as fetchable", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["104.18.1.1", "2606:4700::1111"]) expect(isPrivateAddress(ip)).toBe(false);
  });
  it("fetches a client metadata document only from a public address, and only if it names itself", async () => {
    const url = "https://chatgpt.com/oauth/client.json";
    const doc = { client_id: url, client_name: "ChatGPT", redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"], token_endpoint_auth_method: "private_key_jwt" };
    const ok = await fetchClientMetadata(url, { resolve: async () => ["104.18.1.1"], fetch: async () => new Response(JSON.stringify(doc)) });
    expect(ok).toEqual({ ok: true, metadata: { clientName: "ChatGPT", clientUri: null, logoUri: null, redirectUris: doc.redirect_uris } });
    const internal = await fetchClientMetadata(url, { resolve: async () => ["10.0.0.5"], fetch: async () => new Response(JSON.stringify(doc)) });
    expect(internal.ok).toBe(false);
    const impostor = await fetchClientMetadata(url, { resolve: async () => ["104.18.1.1"], fetch: async () => new Response(JSON.stringify({ ...doc, client_id: "https://other.example/c.json" })) });
    expect(impostor.ok).toBe(false);
    const big = await fetchClientMetadata(url, { resolve: async () => ["104.18.1.1"], fetch: async () => new Response("x".repeat(20_000)) });
    expect(big.ok).toBe(false);
  });
});

describe("authorize", () => {
  it("accepts a good request and grants read only, even when drafts or publishing are asked for", async () => {
    const a = await validateAuthorize(store, params({ scope: "socia:read socia:drafts openid" }), NOW);
    expect(a).toMatchObject({ kind: "ok", scopes: ["socia:read"], askedToPublish: true, state: "st-1" });
    const b = await validateAuthorize(store, params({ scope: "socia:read socia:publish" }), NOW);
    expect(b).toMatchObject({ kind: "ok", scopes: ["socia:read"], askedToPublish: true });
    expect(await validateAuthorize(store, params({ scope: "socia:read" }), NOW)).toMatchObject({ askedToPublish: false });
  });
  it("shows problems with the app on SOCIA's page instead of redirecting", async () => {
    expect((await validateAuthorize(store, params({ client_id: "nope" }), NOW)).kind).toBe("error_page");
    expect((await validateAuthorize(store, params({ redirect_uri: "https://evil.example/cb" }), NOW)).kind).toBe("error_page");
    expect((await validateAuthorize(store, params({ redirect_uri: undefined }), NOW)).kind).toBe("error_page");
  });
  it("sends request errors back to the app with state and iss", async () => {
    const r = await validateAuthorize(store, params({ code_challenge_method: "plain" }), NOW);
    expect(r.kind).toBe("redirect");
    const u = new URL((r as { url: string }).url);
    expect(u.searchParams.get("error")).toBe("invalid_request");
    expect(u.searchParams.get("state")).toBe("st-1");
    expect(u.searchParams.get("iss")).toBe("https://sociaos.com");
    expect(new URL(((await validateAuthorize(store, params({ scope: "admin" }), NOW)) as { url: string }).url).searchParams.get("error")).toBe("invalid_scope");
    expect(new URL(((await validateAuthorize(store, params({ resource: "https://evil.example/mcp" }), NOW)) as { url: string }).url).searchParams.get("error")).toBe("invalid_target");
    expect(new URL(((await validateAuthorize(store, params({ response_type: "token" }), NOW)) as { url: string }).url).searchParams.get("error")).toBe("unsupported_response_type");
  });
  it("keeps a redirect's own query", () => {
    expect(redirectWith("https://app.example/cb?x=1", { code: "c", state: null })).toBe("https://app.example/cb?x=1&code=c");
  });
});

describe("consent", () => {
  it("issues a code bound to the person, the app and the chosen workspaces", async () => {
    const { d } = await connect();
    const u = new URL(d.url);
    expect(u.searchParams.get("state")).toBe("st-1");
    expect(u.searchParams.get("iss")).toBe("https://sociaos.com");
    expect(store.dump().connections).toEqual([expect.objectContaining({ userId: "user-1", clientId: "dcr-1", workspaceIds: ["ws-1"], scopes: ["socia:read"] })]);
  });
  it("adds publishing only when the person ticks it, whatever the app asked for", async () => {
    const asked = await connect(store, { scope: "socia:read socia:publish" });
    expect(asked.t.body.scope).toBe("socia:read");
    const s = memoryStore();
    await s.putClient({ clientId: "dcr-1", kind: "dcr", clientName: "Claude", clientUri: null, logoUri: null, redirectUris: [REDIRECT], fetchedAt: null });
    const ticked = await connect(s, { publish: true });
    expect(ticked.t.body.scope).toBe("socia:read socia:publish");
    expect((await verifyAccessToken(s, ticked.t.body.access_token as string, NOW))?.scopes).toEqual(["socia:read", "socia:publish"]);
  });
  it("switches publishing on and off from Settings at once, for live tokens too", async () => {
    const { t } = await connect();
    const access = t.body.access_token as string;
    const conn = store.dump().connections[0];
    expect((await verifyAccessToken(store, access, NOW))?.scopes).toEqual(["socia:read"]);
    expect(await store.setConnectionScopes("user-2", conn.id, ["socia:read", "socia:publish"], NOW.toISOString())).toBeNull();
    await store.setConnectionScopes("user-1", conn.id, ["socia:read", "socia:publish"], NOW.toISOString());
    expect((await verifyAccessToken(store, access, NOW))?.scopes).toEqual(["socia:read", "socia:publish"]);
    await store.setConnectionScopes("user-1", conn.id, ["socia:read"], NOW.toISOString());
    expect((await verifyAccessToken(store, access, NOW))?.scopes).toEqual(["socia:read"]);
  });
  it("declining sends access_denied and creates nothing", async () => {
    const a = await validateAuthorize(store, params(), NOW);
    const reqId = await createConsentRequest(store, "user-1", a as never, NOW);
    const d = await decide(store, { requestId: reqId, userId: "user-1", allow: false, workspaceIds: [], accessibleWorkspaceIds: ["ws-1"] }, NOW);
    expect(d.ok && new URL(d.url).searchParams.get("error")).toBe("access_denied");
    expect(store.dump().connections).toEqual([]);
  });
  it("refuses another person's request, a reused or expired one, and workspaces the person can't open", async () => {
    const a = await validateAuthorize(store, params(), NOW);
    const reqId = await createConsentRequest(store, "user-1", a as never, NOW);
    expect((await decide(store, { requestId: reqId, userId: "user-2", allow: true, workspaceIds: ["ws-1"], accessibleWorkspaceIds: ["ws-1"] }, NOW)).ok).toBe(false);
    expect((await decide(store, { requestId: reqId, userId: "user-1", allow: true, workspaceIds: ["ws-9"], accessibleWorkspaceIds: ["ws-1"] }, NOW)).ok).toBe(false);
    expect((await decide(store, { requestId: reqId, userId: "user-1", allow: true, workspaceIds: [], accessibleWorkspaceIds: ["ws-1"] }, NOW)).ok).toBe(false);
    expect((await decide(store, { requestId: reqId, userId: "user-1", allow: true, workspaceIds: ["ws-1"], accessibleWorkspaceIds: ["ws-1"] }, at(16 * 60))).ok).toBe(false);
    expect((await decide(store, { requestId: reqId, userId: "user-1", allow: true, workspaceIds: ["ws-1"], accessibleWorkspaceIds: ["ws-1"] }, NOW)).ok).toBe(true);
    expect((await decide(store, { requestId: reqId, userId: "user-1", allow: true, workspaceIds: ["ws-1"], accessibleWorkspaceIds: ["ws-1"] }, NOW)).ok).toBe(false);
  });
});

describe("tokens", () => {
  it("exchanges a code once, with PKCE, for an access token that verifies", async () => {
    const { t } = await connect();
    expect(t.status).toBe(200);
    expect(t.body).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "socia:read" });
    const p = await verifyAccessToken(store, t.body.access_token as string, NOW);
    expect(p).toMatchObject({ userId: "user-1", clientId: "dcr-1", scopes: ["socia:read"], workspaceIds: ["ws-1"] });
    // Stored as hashes only.
    expect(store.dump().tokens.some((x) => x.tokenHash === t.body.access_token)).toBe(false);
  });

  it("refuses a wrong verifier, client, redirect or resource", async () => {
    const tryWith = async (over: Record<string, string>) => {
      const s = memoryStore();
      await s.putClient({ clientId: "dcr-1", kind: "dcr", clientName: "Claude", clientUri: null, logoUri: null, redirectUris: [REDIRECT], fetchedAt: null });
      const a = await validateAuthorize(s, params(), NOW);
      const reqId = await createConsentRequest(s, "user-1", a as never, NOW);
      const d = await decide(s, { requestId: reqId, userId: "user-1", allow: true, workspaceIds: ["ws-1"], accessibleWorkspaceIds: ["ws-1"] }, NOW);
      const code = new URL((d as { url: string }).url).searchParams.get("code")!;
      return token(s, new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: "dcr-1", code_verifier: VERIFIER, ...over }), NOW);
    };
    expect((await tryWith({ code_verifier: "b".repeat(50) })).body.error).toBe("invalid_grant");
    expect((await tryWith({ client_id: "other" })).body.error).toBe("invalid_grant");
    expect((await tryWith({ redirect_uri: "https://claude.ai/other" })).body.error).toBe("invalid_grant");
    expect((await tryWith({ resource: "https://evil.example/mcp" })).body.error).toBe("invalid_target");
  });

  it("treats a reused code as theft and revokes what it issued", async () => {
    const { code, t } = await connect();
    const again = await token(store, new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: "dcr-1", code_verifier: VERIFIER }), NOW);
    expect(again.body.error).toBe("invalid_grant");
    expect(await verifyAccessToken(store, t.body.access_token as string, NOW)).toBeNull();
  });

  it("rotates refresh tokens and revokes everything when an old one is replayed", async () => {
    const { t } = await connect();
    const r1 = t.body.refresh_token as string;
    const next = await token(store, new URLSearchParams({ grant_type: "refresh_token", refresh_token: r1, client_id: "dcr-1" }), at(3700));
    expect(next.status).toBe(200);
    expect(next.body.refresh_token).not.toBe(r1);
    expect(await verifyAccessToken(store, next.body.access_token as string, at(3700))).not.toBeNull();
    // The old one again: reuse.
    const replay = await token(store, new URLSearchParams({ grant_type: "refresh_token", refresh_token: r1, client_id: "dcr-1" }), at(3800));
    expect(replay.body.error).toBe("invalid_grant");
    expect(await verifyAccessToken(store, next.body.access_token as string, at(3800))).toBeNull();
    const after = await token(store, new URLSearchParams({ grant_type: "refresh_token", refresh_token: next.body.refresh_token as string, client_id: "dcr-1" }), at(3900));
    expect(after.body.error).toBe("invalid_grant");
  });

  it("expires access tokens after an hour and refuses refresh to add scopes", async () => {
    const { t } = await connect();
    expect(await verifyAccessToken(store, t.body.access_token as string, at(3601))).toBeNull();
    const wider = await token(store, new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.body.refresh_token as string, client_id: "dcr-1", scope: "socia:read socia:drafts" }), NOW);
    expect(wider.body.error).toBe("invalid_scope");
  });

  it("stops every token when the person disconnects, and when the app revokes", async () => {
    const { t, d } = await connect();
    expect(await store.revokeConnection("user-2", d.connection!.id, NOW.toISOString())).toBe(false);
    expect(await store.revokeConnection("user-1", d.connection!.id, NOW.toISOString())).toBe(true);
    expect(await verifyAccessToken(store, t.body.access_token as string, NOW)).toBeNull();
    expect((await token(store, new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.body.refresh_token as string, client_id: "dcr-1" }), NOW)).body.error).toBe("invalid_grant");

    const s2 = memoryStore();
    await s2.putClient({ clientId: "dcr-1", kind: "dcr", clientName: "Claude", clientUri: null, logoUri: null, redirectUris: [REDIRECT], fetchedAt: null });
    const c2 = await connect(s2);
    await revokeToken(s2, c2.t.body.refresh_token as string, NOW);
    expect(await verifyAccessToken(s2, c2.t.body.access_token as string, NOW)).toBeNull();
  });

  it("only accepts SOCIA access tokens at the resource", async () => {
    expect(await verifyAccessToken(store, undefined, NOW)).toBeNull();
    expect(await verifyAccessToken(store, "eyJhbGciOi.supabase.jwt", NOW)).toBeNull();
    const { t } = await connect();
    expect(await verifyAccessToken(store, t.body.refresh_token as string, NOW)).toBeNull();
  });

  it("checks PKCE strictly", () => {
    expect(verifyPkce(VERIFIER, CHALLENGE)).toBe(true);
    expect(verifyPkce("short", s256("short"))).toBe(false);
    expect(verifyPkce(VERIFIER, "x".repeat(43))).toBe(false);
  });
});

// Where the OAuth server keeps its state (supabase/ai-assistants.sql). Every
// write that must happen once (using a code, a consent request, rotating a
// refresh token) is a conditional update, so two racing requests can't both
// win. The Supabase store runs on the service role and always filters by the
// ids it was given; the memory store is for tests.
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type ClientRec = {
  clientId: string;
  kind: "dcr" | "cimd";
  clientName: string | null;
  clientUri: string | null;
  logoUri: string | null;
  redirectUris: string[];
  fetchedAt: string | null;
};

export type RequestRec = {
  id: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scopes: string[];
  resource: string | null;
  expiresAt: string;
  usedAt: string | null;
};

export type ConnectionRec = {
  id: string;
  userId: string;
  clientId: string;
  clientName: string | null;
  scopes: string[];
  workspaceIds: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type CodeRec = {
  codeHash: string;
  connectionId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
  scopes: string[];
  expiresAt: string;
  usedAt: string | null;
};

export type TokenRec = {
  id: string;
  connectionId: string;
  kind: "access" | "refresh";
  tokenHash: string;
  scopes: string[];
  expiresAt: string;
  revokedAt: string | null;
  replacedBy: string | null;
};

export interface OAuthStore {
  getClient(clientId: string): Promise<ClientRec | null>;
  putClient(rec: ClientRec): Promise<void>;

  createRequest(rec: Omit<RequestRec, "id" | "usedAt">): Promise<string>;
  getRequest(id: string): Promise<RequestRec | null>;
  /** Marks the request used; false if it already was. */
  useRequest(id: string, now: string): Promise<boolean>;

  upsertConnection(rec: { userId: string; clientId: string; clientName: string | null; scopes: string[]; workspaceIds: string[]; now: string }): Promise<ConnectionRec>;
  getConnection(id: string): Promise<ConnectionRec | null>;
  listConnections(userId: string): Promise<ConnectionRec[]>;
  revokeConnection(userId: string, id: string, now: string): Promise<boolean>;
  touchConnection(id: string, now: string): Promise<void>;

  createCode(rec: Omit<CodeRec, "usedAt">): Promise<void>;
  /** Marks the code used. `rec` is null for an unknown code; `alreadyUsed` is true when it had been used before. */
  useCode(codeHash: string, now: string): Promise<{ rec: CodeRec | null; alreadyUsed: boolean }>;

  insertTokens(tokens: Omit<TokenRec, "revokedAt" | "replacedBy">[]): Promise<void>;
  findToken(tokenHash: string): Promise<TokenRec | null>;
  /** Revokes the token in favour of `replacedBy`; false if it was already revoked (a race or a reuse). */
  replaceToken(id: string, replacedBy: string, now: string): Promise<boolean>;
  revokeConnectionTokens(connectionId: string, now: string): Promise<void>;
}

// ----------------------------------------------------------------- Supabase

const toClient = (r: Record<string, unknown>): ClientRec => ({
  clientId: r.client_id as string, kind: r.kind as ClientRec["kind"], clientName: (r.client_name as string) ?? null,
  clientUri: (r.client_uri as string) ?? null, logoUri: (r.logo_uri as string) ?? null, redirectUris: (r.redirect_uris as string[]) ?? [],
  fetchedAt: (r.fetched_at as string) ?? null,
});
const toRequest = (r: Record<string, unknown>): RequestRec => ({
  id: r.id as string, userId: r.user_id as string, clientId: r.client_id as string, redirectUri: r.redirect_uri as string,
  codeChallenge: r.code_challenge as string, state: (r.state as string) ?? null, scopes: (r.scopes as string[]) ?? [],
  resource: (r.resource as string) ?? null, expiresAt: r.expires_at as string, usedAt: (r.used_at as string) ?? null,
});
const toConnection = (r: Record<string, unknown>): ConnectionRec => ({
  id: r.id as string, userId: r.user_id as string, clientId: r.client_id as string, clientName: (r.client_name as string) ?? null,
  scopes: (r.scopes as string[]) ?? [], workspaceIds: (r.workspace_ids as string[]) ?? [], createdAt: r.created_at as string,
  lastUsedAt: (r.last_used_at as string) ?? null, revokedAt: (r.revoked_at as string) ?? null,
});
const toCode = (r: Record<string, unknown>): CodeRec => ({
  codeHash: r.code_hash as string, connectionId: r.connection_id as string, clientId: r.client_id as string, redirectUri: r.redirect_uri as string,
  codeChallenge: r.code_challenge as string, resource: (r.resource as string) ?? null, scopes: (r.scopes as string[]) ?? [],
  expiresAt: r.expires_at as string, usedAt: (r.used_at as string) ?? null,
});
const toToken = (r: Record<string, unknown>): TokenRec => ({
  id: r.id as string, connectionId: r.connection_id as string, kind: r.kind as TokenRec["kind"], tokenHash: r.token_hash as string,
  scopes: (r.scopes as string[]) ?? [], expiresAt: r.expires_at as string, revokedAt: (r.revoked_at as string) ?? null, replacedBy: (r.replaced_by as string) ?? null,
});

const must = <T>({ data, error }: { data: T; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data;
};

export function supabaseStore(svc: Supa): OAuthStore {
  return {
    async getClient(clientId) {
      const data = must(await svc.from("oauth_clients").select("*").eq("client_id", clientId).maybeSingle());
      return data ? toClient(data) : null;
    },
    async putClient(rec) {
      must(await svc.from("oauth_clients").upsert({
        client_id: rec.clientId, kind: rec.kind, client_name: rec.clientName, client_uri: rec.clientUri, logo_uri: rec.logoUri,
        redirect_uris: rec.redirectUris, fetched_at: rec.fetchedAt,
      }, { onConflict: "client_id" }));
    },
    async createRequest(rec) {
      const data = must(await svc.from("oauth_requests").insert({
        user_id: rec.userId, client_id: rec.clientId, redirect_uri: rec.redirectUri, code_challenge: rec.codeChallenge, state: rec.state,
        scopes: rec.scopes, resource: rec.resource, expires_at: rec.expiresAt,
      }).select("id").single());
      return (data as { id: string }).id;
    },
    async getRequest(id) {
      const data = must(await svc.from("oauth_requests").select("*").eq("id", id).maybeSingle());
      return data ? toRequest(data) : null;
    },
    async useRequest(id, now) {
      const data = must(await svc.from("oauth_requests").update({ used_at: now }).eq("id", id).is("used_at", null).select("id"));
      return Array.isArray(data) && data.length === 1;
    },
    async upsertConnection(rec) {
      const data = must(await svc.from("ai_connections").upsert({
        user_id: rec.userId, client_id: rec.clientId, client_name: rec.clientName, scopes: rec.scopes, workspace_ids: rec.workspaceIds,
        updated_at: rec.now, revoked_at: null,
      }, { onConflict: "user_id,client_id" }).select("*").single());
      return toConnection(data as Record<string, unknown>);
    },
    async getConnection(id) {
      const data = must(await svc.from("ai_connections").select("*").eq("id", id).maybeSingle());
      return data ? toConnection(data) : null;
    },
    async listConnections(userId) {
      const data = must(await svc.from("ai_connections").select("*").eq("user_id", userId).order("created_at", { ascending: false }));
      return ((data ?? []) as Record<string, unknown>[]).map(toConnection);
    },
    async revokeConnection(userId, id, now) {
      const data = must(await svc.from("ai_connections").update({ revoked_at: now, updated_at: now }).eq("id", id).eq("user_id", userId).is("revoked_at", null).select("id"));
      if (!(Array.isArray(data) && data.length)) return false;
      must(await svc.from("oauth_tokens").update({ revoked_at: now }).eq("connection_id", id).is("revoked_at", null));
      return true;
    },
    async touchConnection(id, now) {
      await svc.from("ai_connections").update({ last_used_at: now }).eq("id", id);
    },
    async createCode(rec) {
      must(await svc.from("oauth_codes").insert({
        code_hash: rec.codeHash, connection_id: rec.connectionId, client_id: rec.clientId, redirect_uri: rec.redirectUri,
        code_challenge: rec.codeChallenge, resource: rec.resource, scopes: rec.scopes, expires_at: rec.expiresAt,
      }));
    },
    async useCode(codeHash, now) {
      const data = must(await svc.from("oauth_codes").update({ used_at: now }).eq("code_hash", codeHash).is("used_at", null).select("*"));
      if (Array.isArray(data) && data.length) return { rec: toCode(data[0] as Record<string, unknown>), alreadyUsed: false };
      const prior = must(await svc.from("oauth_codes").select("*").eq("code_hash", codeHash).maybeSingle());
      return prior ? { rec: toCode(prior), alreadyUsed: true } : { rec: null, alreadyUsed: false };
    },
    async insertTokens(tokens) {
      must(await svc.from("oauth_tokens").insert(tokens.map((t) => ({
        id: t.id, connection_id: t.connectionId, kind: t.kind, token_hash: t.tokenHash, scopes: t.scopes, expires_at: t.expiresAt,
      }))));
    },
    async findToken(tokenHash) {
      const data = must(await svc.from("oauth_tokens").select("*").eq("token_hash", tokenHash).maybeSingle());
      return data ? toToken(data) : null;
    },
    async replaceToken(id, replacedBy, now) {
      const data = must(await svc.from("oauth_tokens").update({ revoked_at: now, replaced_by: replacedBy }).eq("id", id).is("revoked_at", null).select("id"));
      return Array.isArray(data) && data.length === 1;
    },
    async revokeConnectionTokens(connectionId, now) {
      must(await svc.from("oauth_tokens").update({ revoked_at: now }).eq("connection_id", connectionId).is("revoked_at", null));
    },
  };
}

// ------------------------------------------------------------------- Memory

export function memoryStore(): OAuthStore & { dump(): { connections: ConnectionRec[]; tokens: TokenRec[] } } {
  const clients = new Map<string, ClientRec>();
  const requests = new Map<string, RequestRec>();
  const connections = new Map<string, ConnectionRec>();
  const codes = new Map<string, CodeRec>();
  const tokens = new Map<string, TokenRec>();
  let n = 0;
  const id = () => `id-${++n}`;
  return {
    dump: () => ({ connections: [...connections.values()], tokens: [...tokens.values()] }),
    async getClient(clientId) { return clients.get(clientId) ?? null; },
    async putClient(rec) { clients.set(rec.clientId, { ...rec }); },
    async createRequest(rec) { const i = id(); requests.set(i, { ...rec, id: i, usedAt: null }); return i; },
    async getRequest(i) { return requests.get(i) ?? null; },
    async useRequest(i, now) { const r = requests.get(i); if (!r || r.usedAt) return false; r.usedAt = now; return true; },
    async upsertConnection(rec) {
      const cur = [...connections.values()].find((c) => c.userId === rec.userId && c.clientId === rec.clientId);
      const next: ConnectionRec = {
        id: cur?.id ?? id(), userId: rec.userId, clientId: rec.clientId, clientName: rec.clientName, scopes: rec.scopes, workspaceIds: rec.workspaceIds,
        createdAt: cur?.createdAt ?? rec.now, lastUsedAt: cur?.lastUsedAt ?? null, revokedAt: null,
      };
      connections.set(next.id, next);
      return next;
    },
    async getConnection(i) { return connections.get(i) ?? null; },
    async listConnections(userId) { return [...connections.values()].filter((c) => c.userId === userId); },
    async revokeConnection(userId, i, now) {
      const c = connections.get(i);
      if (!c || c.userId !== userId || c.revokedAt) return false;
      c.revokedAt = now;
      for (const t of tokens.values()) if (t.connectionId === i && !t.revokedAt) t.revokedAt = now;
      return true;
    },
    async touchConnection(i, now) { const c = connections.get(i); if (c) c.lastUsedAt = now; },
    async createCode(rec) { codes.set(rec.codeHash, { ...rec, usedAt: null }); },
    async useCode(h, now) {
      const c = codes.get(h);
      if (!c) return { rec: null, alreadyUsed: false };
      if (c.usedAt) return { rec: { ...c }, alreadyUsed: true };
      c.usedAt = now;
      return { rec: { ...c }, alreadyUsed: false };
    },
    async insertTokens(list) { for (const t of list) tokens.set(t.id, { ...t, revokedAt: null, replacedBy: null }); },
    async findToken(h) { const t = [...tokens.values()].find((x) => x.tokenHash === h); return t ? { ...t } : null; },
    async replaceToken(i, by, now) { const t = tokens.get(i); if (!t || t.revokedAt) return false; t.revokedAt = now; t.replacedBy = by; return true; },
    async revokeConnectionTokens(connectionId, now) { for (const t of tokens.values()) if (t.connectionId === connectionId && !t.revokedAt) t.revokedAt = now; },
  };
}

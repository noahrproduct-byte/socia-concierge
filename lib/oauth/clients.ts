// Which apps may ask to connect, and where SOCIA may send a person back to.
//
//   Dynamic registration (RFC 7591): the app POSTs its name and redirect URIs
//     and gets a random client_id. Public clients only (no secrets, PKCE).
//   Client ID Metadata Documents: the client_id IS an https URL serving the
//     app's metadata; SOCIA fetches it (no redirects, small, quick, never a
//     private address) and checks it names itself.
//
// Redirect URIs: https (no fragment), or http on a loopback address for
// desktop apps such as Claude Code, where the port may change between runs
// (RFC 8252 §7.3). Nothing else.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type ClientMetadata = {
  clientName: string | null;
  clientUri: string | null;
  logoUri: string | null;
  redirectUris: string[];
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MAX_REDIRECTS = 10;

export function isAllowedRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 2000) return false;
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:") return Boolean(u.hostname);
  if (u.protocol === "http:") return LOOPBACK_HOSTS.has(u.hostname);
  return false;
}

/** Exact match, except a loopback redirect may use any port. */
export function redirectMatches(registered: string[], uri: string): boolean {
  if (registered.includes(uri)) return true;
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.protocol !== "http:" || !LOOPBACK_HOSTS.has(u.hostname)) return false;
  return registered.some((r) => {
    try {
      const v = new URL(r);
      return v.protocol === "http:" && v.hostname === u.hostname && v.pathname === u.pathname && v.search === u.search;
    } catch {
      return false;
    }
  });
}

const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const httpsUrl = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  try { const u = new URL(v); return u.protocol === "https:" ? u.toString() : null; } catch { return null; }
};

export type RegistrationError = { error: "invalid_redirect_uri" | "invalid_client_metadata"; error_description: string };

/** A dynamic registration request, checked. */
export function validateRegistration(body: unknown, opts: { metadataDocument?: boolean } = {}): { ok: true; metadata: ClientMetadata } | { ok: false; error: RegistrationError } {
  if (!body || typeof body !== "object") return { ok: false, error: { error: "invalid_client_metadata", error_description: "Send the client metadata as a JSON object." } };
  const b = body as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > MAX_REDIRECTS) {
    return { ok: false, error: { error: "invalid_redirect_uri", error_description: `redirect_uris must list 1 to ${MAX_REDIRECTS} URIs.` } };
  }
  const bad = uris.find((u) => !isAllowedRedirectUri(u));
  if (bad !== undefined) return { ok: false, error: { error: "invalid_redirect_uri", error_description: "Redirect URIs must be https, or http on localhost / 127.0.0.1, with no fragment." } };
  // A metadata document may also declare private_key_jwt (ChatGPT's can).
  // SOCIA treats every assistant as a public client either way: PKCE protects
  // the code, and no client credential is ever relied on.
  const auth = b.token_endpoint_auth_method;
  if (auth !== undefined && auth !== "none" && !(opts.metadataDocument && auth === "private_key_jwt")) {
    return { ok: false, error: { error: "invalid_client_metadata", error_description: "SOCIA registers public clients only: token_endpoint_auth_method must be \"none\" (PKCE is required)." } };
  }
  // Extra grant types are ignored, not refused: Claude's metadata document also
  // lists jwt-bearer (enterprise SSO). SOCIA's token endpoint only ever honours
  // authorization_code and refresh_token, so a declared extra grants nothing.
  const grants = b.grant_types;
  if (grants !== undefined && (!Array.isArray(grants) || !grants.includes("authorization_code"))) {
    return { ok: false, error: { error: "invalid_client_metadata", error_description: "grant_types must include authorization_code." } };
  }
  const responses = b.response_types;
  if (responses !== undefined && (!Array.isArray(responses) || responses.some((r) => r !== "code"))) {
    return { ok: false, error: { error: "invalid_client_metadata", error_description: "Supported response_types: code." } };
  }
  return {
    ok: true,
    metadata: { clientName: text(b.client_name, 100), clientUri: httpsUrl(b.client_uri), logoUri: httpsUrl(b.logo_uri), redirectUris: Array.from(new Set(uris as string[])) },
  };
}

// ------------------------------------------------- Client ID Metadata Documents

/** A client_id that is a metadata document URL: https, with a path, no fragment or credentials. */
export function isCimdClientId(id: string): boolean {
  try {
    const u = new URL(id);
    return u.protocol === "https:" && !u.hash && !u.username && !u.password && u.pathname.length > 1;
  } catch {
    return false;
  }
}

/** "::ffff:7f00:1" -> [0,0,0,0,0,0xffff,0x7f00,1]; null when not IPv6. Handles "::" and a dotted IPv4 tail. */
function ipv6Hextets(ip: string): number[] | null {
  if (isIP(ip) !== 6) return null;
  let s = ip.toLowerCase().split("%")[0];
  const dotted = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted[1].split(".").map(Number);
    s = s.slice(0, -dotted[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail ? tail.split(":") : [];
  const fill = s.includes("::") ? 8 - h.length - t.length : 0;
  const parts = [...h, ...Array(fill).fill("0"), ...t].map((x) => parseInt(x || "0", 16));
  return parts.length === 8 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? parts : null;
}

const v4FromHextets = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/**
 * Addresses SOCIA must never fetch from: loopback, private, link-local, CGNAT,
 * multicast, reserved and documentation ranges, and any IPv6 form that
 * carries such an IPv4 address (mapped ::ffff:0:0/96, compatible ::/96,
 * NAT64 64:ff9b::/96, 6to4 2002::/16), whatever notation the URL parser
 * produced ("::ffff:7f00:1" is 127.0.0.1).
 */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const h = ipv6Hextets(ip);
  if (!h) return true; // unparseable: never fetch
  const zeros = (n: number) => h.slice(0, n).every((x) => x === 0);
  if (h.every((x) => x === 0)) return true; // ::
  if (zeros(7) && h[7] === 1) return true; // ::1
  if (zeros(5) && h[5] === 0xffff) return isPrivateAddress(v4FromHextets(h[6], h[7])); // ::ffff:a.b.c.d
  if (zeros(6)) return isPrivateAddress(v4FromHextets(h[6], h[7])); // ::a.b.c.d (deprecated)
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0)) return isPrivateAddress(v4FromHextets(h[6], h[7])); // NAT64
  if (h[0] === 0x2002) return isPrivateAddress(v4FromHextets(h[1], h[2])); // 6to4
  if (h[0] === 0x100 && h.slice(1, 4).every((x) => x === 0)) return true; // discard 100::/64
  if (h[0] === 0x2001 && h[1] === 0xdb8) return true; // documentation
  if (h[0] === 0x2001 && h[1] < 0x200) return true; // 2001::/23 IETF special (Teredo, ORCHID, benchmarking)
  const top = h[0] >> 8;
  if (top === 0xff) return true; // multicast
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  return false;
}

export type FetchDeps = { fetch: typeof fetch; resolve: (host: string) => Promise<string[]> };

const defaultDeps: FetchDeps = {
  fetch: (...a) => fetch(...a),
  resolve: async (host) => (await lookup(host, { all: true })).map((r) => r.address),
};

const MAX_DOC_BYTES = 16 * 1024;

/** Fetch and check a client's metadata document. The document must name itself as client_id. */
export async function fetchClientMetadata(clientId: string, deps: FetchDeps = defaultDeps): Promise<{ ok: true; metadata: ClientMetadata } | { ok: false; reason: string }> {
  if (!isCimdClientId(clientId)) return { ok: false, reason: "The client_id isn't an https metadata URL." };
  const host = new URL(clientId).hostname;
  try {
    const addrs = isIP(host.replace(/^\[|\]$/g, "")) ? [host.replace(/^\[|\]$/g, "")] : await deps.resolve(host);
    if (!addrs.length || addrs.some(isPrivateAddress)) return { ok: false, reason: "The client's metadata address isn't public." };
  } catch {
    return { ok: false, reason: "The client's metadata host couldn't be found." };
  }
  let res: Response;
  try {
    res = await deps.fetch(clientId, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
  } catch {
    return { ok: false, reason: "The client's metadata document couldn't be fetched." };
  }
  if (!res.ok) return { ok: false, reason: `The client's metadata document answered ${res.status}.` };
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_DOC_BYTES) return { ok: false, reason: "The client's metadata document is too large." };
  const raw = await res.text().catch(() => "");
  if (raw.length > MAX_DOC_BYTES) return { ok: false, reason: "The client's metadata document is too large." };
  let doc: Record<string, unknown>;
  try { doc = JSON.parse(raw); } catch { return { ok: false, reason: "The client's metadata document isn't JSON." }; }
  if (!doc || typeof doc !== "object" || doc.client_id !== clientId) return { ok: false, reason: "The client's metadata document doesn't name itself as this client_id." };
  const v = validateRegistration(doc, { metadataDocument: true });
  if (!v.ok) return { ok: false, reason: v.error.error_description };
  return { ok: true, metadata: v.metadata };
}

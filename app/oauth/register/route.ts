import { randomBytes } from "node:crypto";
import { validateRegistration } from "@/lib/oauth/clients";
import { addressKey, audit, json, notReady, oauthStore, preflight, rateHit } from "@/lib/oauth/runtime";

export const runtime = "nodejs";

// RFC 7591 dynamic registration for public clients (no secret; PKCE is
// required at authorization). Kept for MCP clients that don't use client
// metadata documents yet. Rate-limited per address.
const PER_HOUR = 20;

export async function POST(req: Request) {
  const store = oauthStore();
  if (!store) return notReady();
  const rate = await rateHit(`register:${addressKey(req)}`, 3600, PER_HOUR);
  if (rate === "unavailable") return notReady();
  if (rate === "limited") return json({ error: "slow_down", error_description: "Too many registrations from this address. Try again later." }, 429);
  const body = await req.json().catch(() => null);
  const v = validateRegistration(body);
  if (!v.ok) return json(v.error, 400);
  const clientId = `socia_cl_${randomBytes(18).toString("base64url")}`;
  try {
    await store.putClient({ clientId, kind: "dcr", ...v.metadata, fetchedAt: null });
  } catch (e) {
    console.error("[oauth] register", (e as Error)?.message ?? e);
    return json({ error: "server_error", error_description: "Registration failed. Try again." }, 500);
  }
  await audit({ clientId, action: "register", outcome: "ok", detail: { name: v.metadata.clientName } });
  return json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: v.metadata.clientName ?? undefined,
    redirect_uris: v.metadata.redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }, 201);
}
export const OPTIONS = preflight;

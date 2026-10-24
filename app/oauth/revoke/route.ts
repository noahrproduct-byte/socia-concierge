import { revokeToken } from "@/lib/oauth/server";
import { addressKey, audit, json, notReady, oauthStore, preflight, rateHit } from "@/lib/oauth/runtime";

export const runtime = "nodejs";

// RFC 7009: revoking a token ends every token of that connection. Always 200,
// even for an unknown token, so the endpoint reveals nothing.
const PER_MINUTE = 60;
const MAX_BODY = 4096;

export async function POST(req: Request) {
  const store = oauthStore();
  if (!store) return notReady();
  const rate = await rateHit(`revoke:${addressKey(req)}`, 60, PER_MINUTE);
  if (rate === "limited") return json({ error: "slow_down", error_description: "Too many requests. Try again in a minute." }, 429);
  const body = await req.text().catch(() => "");
  if (body.length > MAX_BODY) return json({ error: "invalid_request" }, 400);
  const form = new URLSearchParams(body);
  try {
    const hit = await revokeToken(store, form.get("token"), new Date());
    // Only a real revocation is logged; nothing from the form is stored.
    if (hit) await audit({ connectionId: hit.connectionId, action: "revoke", outcome: "ok" });
  } catch (e) {
    console.error("[oauth] revoke", (e as Error)?.message ?? e);
  }
  return json({}, 200);
}
export const OPTIONS = preflight;

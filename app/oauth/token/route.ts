import { token } from "@/lib/oauth/server";
import { addressKey, audit, json, notReady, oauthStore, preflight, rateHit } from "@/lib/oauth/runtime";

export const runtime = "nodejs";

// Token endpoint: authorization_code (PKCE S256) and refresh_token (rotated).
// Public clients only: client_id in the form, no secret.
const PER_MINUTE = 60;

export async function POST(req: Request) {
  const store = oauthStore();
  if (!store) return notReady();
  const rate = await rateHit(`token:${addressKey(req)}`, 60, PER_MINUTE);
  if (rate === "unavailable") return notReady();
  if (rate === "limited") return json({ error: "slow_down", error_description: "Too many token requests. Try again in a minute." }, 429);
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/x-www-form-urlencoded")) return json({ error: "invalid_request", error_description: "Send application/x-www-form-urlencoded." }, 400);
  if (req.headers.get("authorization")?.startsWith("Basic ")) {
    return json({ error: "invalid_client", error_description: "SOCIA's clients are public: send client_id in the form, no secret." }, 401);
  }
  const form = new URLSearchParams(await req.text());
  try {
    const r = await token(store, form, new Date());
    await audit({ clientId: form.get("client_id"), action: `token:${form.get("grant_type") ?? "?"}`, outcome: r.status === 200 ? "ok" : "denied", detail: r.status === 200 ? null : { error: r.body.error } });
    return json(r.body, r.status);
  } catch (e) {
    console.error("[oauth] token", (e as Error)?.message ?? e);
    return json({ error: "server_error", error_description: "Something went wrong. Try again." }, 500);
  }
}
export const OPTIONS = preflight;

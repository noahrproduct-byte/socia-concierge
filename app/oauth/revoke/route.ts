import { revokeToken } from "@/lib/oauth/server";
import { audit, json, notReady, oauthStore, preflight } from "@/lib/oauth/runtime";

export const runtime = "nodejs";

// RFC 7009: revoking a token ends every token of that connection. Always 200,
// even for an unknown token, so the endpoint reveals nothing.
export async function POST(req: Request) {
  const store = oauthStore();
  if (!store) return notReady();
  const form = new URLSearchParams(await req.text().catch(() => ""));
  try {
    await revokeToken(store, form.get("token"), new Date());
    await audit({ clientId: form.get("client_id"), action: "revoke", outcome: "ok" });
  } catch (e) {
    console.error("[oauth] revoke", (e as Error)?.message ?? e);
  }
  return json({}, 200);
}
export const OPTIONS = preflight;

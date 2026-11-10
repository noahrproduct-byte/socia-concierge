// Request plumbing shared by the AI Clipper and AI Studio routes: who is
// asking, their plan (both features are on Scale), their role, and the
// answers for the things that go wrong in every route (credits short, tables
// missing, a provider refusing). Server only.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy, type Ctx } from "@/lib/context";
import { requireFeature } from "@/lib/planGuard";
import type { Entitlements } from "@/lib/entitlements";
import type { FeatureKey } from "@/lib/plans";
import { CreditsError } from "@/lib/credits/ledger";
import { ClipperError } from "@/lib/clipper/provider";
import { GenerationError } from "@/lib/generation/provider";
import { APIError } from "@anthropic-ai/sdk";
import { AI_UNAVAILABLE_COPY, aiFailureKind } from "@/lib/aiStatus";
import { publicMessage } from "@/lib/dbError";

export type AiRequest = { ok: true; ctx: Ctx; ent: Entitlements; viewerId: string } | { ok: false; res: NextResponse };

/** Signed in, in a workspace, and on a plan with the feature (403 with the upgrade sentence otherwise). */
export async function aiRequest(feature: FeatureKey, opts: { mutate?: boolean } = {}): Promise<AiRequest> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, res: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  const ctx = await resolveContext(supabase, user.id);
  const { ent, denied } = await requireFeature(ctx.client, ctx.ownerId, feature);
  if (denied) return { ok: false, res: denied };
  if (opts.mutate && !can(ctx, "publish")) return { ok: false, res: NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 }) };
  return { ok: true, ctx, ent, viewerId: user.id };
}

export const MIGRATION_HINT = "The AI Clipper and AI Studio need their database tables. Run supabase/ai-studio.sql in the Supabase SQL editor.";
export const isMissingTable = (e: unknown): boolean => /relation .* does not exist|PGRST205|PGRST202|Could not find the (table|function)/i.test((e as Error)?.message ?? String(e));

const SERVER_ERROR = "SOCIA hit an error on its side. Try again in a moment.";

/**
 * The one answer for anything these routes throw. SOCIA's own sentences pass
 * through; database, storage and AI service errors go to the log only.
 */
export function aiErrorResponse(where: string, e: unknown): NextResponse {
  if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
  if (e instanceof CreditsError) {
    if (e.code === "insufficient_credits") return NextResponse.json({ error: "Not enough credits for this. Buy a top-up or wait for next month's allowance.", code: "insufficient_credits", balance: e.balance }, { status: 402 });
    console.error(`[${where}]`, e.message);
    return NextResponse.json({ error: "Credits are unavailable right now. Try again in a moment.", code: "credits_unavailable" }, { status: 503 });
  }
  if (e instanceof ClipperError || e instanceof GenerationError) {
    if (e.code === "db") {
      console.error(`[${where}]`, e.message);
      return NextResponse.json({ error: SERVER_ERROR }, { status: 500 });
    }
    const status = e.code === "not_configured" || e.code === "no_service" ? 503 : e.retryable ? 503 : 400;
    return NextResponse.json({ error: e.message, code: e.code }, { status });
  }
  if (e instanceof APIError) {
    const kind = aiFailureKind(e);
    console.error(`[ai] ${where} ${kind} status=${e.status ?? "none"}: ${e.message.replace(/\s+/g, " ").slice(0, 300)}`);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
  }
  const status = (e as { status?: number })?.status;
  if (status && status >= 400 && status < 600) return NextResponse.json({ error: publicMessage(where, e, SERVER_ERROR) }, { status });
  console.error(`[${where}]`, (e as Error)?.message ?? e);
  return NextResponse.json({ error: SERVER_ERROR }, { status: 500 });
}

/** Where providers should call back: the public origin, never localhost. */
export function publicOrigin(req: Request): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const origin = new URL(req.url).origin;
  return /localhost|127\.0\.0\.1/.test(origin) ? null : origin;
}

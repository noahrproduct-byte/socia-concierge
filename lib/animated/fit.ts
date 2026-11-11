// The scan behind "Post animated videos": does an account's niche, its own
// posts and what works for others in its niche suggest that animated text
// videos suit it? One model call; the answer is checked (lib/animated/fitCore.ts)
// and saved on the brand (brand_detail.animated.fit). Server only.
import { anthropic, MODEL, effortFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { brandWorkspace, type Ctx } from "@/lib/context";
import { getIgSnapshot } from "@/lib/instagramSync";
import { competitorScopeId, updateWorkspace } from "@/lib/workspaces";
import { loadCachedNicheRead } from "@/lib/trendSignalsLoad";
import { trendsEvidence } from "@/lib/trendSignals";
import { freshDetail } from "@/lib/intel/understandLoad";
import { getProfile, type BrandDetail } from "@/lib/profile";
import { cleanFit, postsEvidence, type AnimatedFit } from "./fitCore";

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["verdict", "reasons"],
  properties: {
    verdict: { type: "string", enum: ["suits", "test", "unlikely"] },
    reasons: { type: "array", items: { type: "string" } },
  },
} as const;

const SYSTEM = `You judge whether animated videos suit one social media account. An animated video is a short vertical video drawn in code with no footage, no people and no photos: either a comparison (2 to 4 options side by side whose numbers count up, like three grind sizes and their shot times) or words on screen (an opening line, a few points or a list, an ending).
They tend to suit accounts that share tips, comparisons, how-it-works, lists, opinions, explanations, announcements or offers, and people who don't want to be on camera. They tend not to suit accounts whose appeal is visual (food, fashion, places, products, faces, before and after), where real footage does the work.
Answer with:
- verdict: "suits" when the evidence clearly points that way, "test" when it is mixed or there is little evidence, "unlikely" when the account's appeal is clearly visual.
- reasons: two or three short sentences, each pointing at something in the evidence (a kind of post and how it did, what leads in the niche, the account type, what the person said about being on camera). Plain words, sentence case, no em dashes. Never use a number that isn't in the evidence, and never promise results.`;

export async function scanAnimatedFit(ctx: Ctx): Promise<AnimatedFit> {
  const brandWs = brandWorkspace(ctx);
  const [profile, snap, niche] = await Promise.all([
    getProfile(ctx.client, ctx.ownerId, brandWs).catch(() => null),
    getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => null),
    competitorScopeId(ctx.client, ctx.workspace?.id ?? null).then((scope) => loadCachedNicheRead(ctx.client, ctx.ownerId, scope)).catch(() => null),
  ]);
  const growth = profile?.brand_detail?.growth;
  const posts = postsEvidence(snap?.media ?? []);
  const evidence = [
    `Niche: ${profile?.niche ?? "not set"}${growth?.focus ? `; about: ${growth.focus}` : ""}.`,
    growth?.account_type ? `Account type: ${growth.account_type}.` : "",
    growth?.personality?.on_camera ? `On camera: ${growth.personality.on_camera}.` : "",
    posts.text,
    trendsEvidence(niche?.signals ?? null) || "No niche trend read is stored yet.",
  ].filter(Boolean).join("\n");
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 2000, system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA }, ...effortFor(MODEL, "medium") },
    messages: [{ role: "user", content: `# Evidence\n${evidence}\n\nDo animated text videos suit this account?` }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  recordAiUsage(ctx.ownerId, "animated_fit", res);
  const block = res.content.find((b: { type: string }) => b.type === "text");
  const text = block && "text" in block ? (block as { text: string }).text : "";
  let raw: unknown = null;
  try { raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { raw = null; }
  const fit = cleanFit(raw, evidence, posts.read);
  if (!fit) throw Object.assign(new Error("SOCIA's check came back incomplete. Try again."), { status: 502 });
  return fit;
}

/** Save the scan on the brand's own row, keeping the person's choice. */
export async function saveAnimatedFit(ctx: Ctx, fit: AnimatedFit): Promise<boolean> {
  const detail = await freshDetail(ctx);
  const next: BrandDetail = { ...detail, animated: { ...(detail.animated ?? {}), fit } };
  const ws = brandWorkspace(ctx);
  if (ws) return updateWorkspace(ctx.client, ctx.ownerId, ws.id, { brand_detail: next });
  const { error } = await ctx.client.from("profiles").upsert({ user_id: ctx.ownerId, brand_detail: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return !error;
}

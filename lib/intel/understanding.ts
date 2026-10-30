// Account understanding: what SOCIA infers about a brand from its connected
// accounts, each finding with its own confidence (0-100) and the evidence it
// rests on, kept apart from what the person confirmed. Stored in
// brand_detail.growth.understanding; the confirmed answers live in the
// ordinary Growth Profile fields and always win.
//
// Pure: types, the model's output schema, the prompt text, and the
// normalisation that keeps only allowed values. The model call lives in
// lib/intel/understandLoad.ts.

import { NICHES } from "../niches";
import { ACCOUNT_TYPES, MAIN_GOALS, REACH_SCOPES, type AccountType, type MainGoalId, type ReachScope } from "../growth";
import type { AccountSample, PlatformFacts } from "./accountSample";

export type Inferred<T> = { value: T; confidence: number; evidence: string[] };

export type Understanding = {
  analyzed_at: string;
  /** Deterministic facts per connected platform (no AI). */
  facts: PlatformFacts[];
  account_type: Inferred<AccountType> | null;
  niche: Inferred<{ category: string; subcategory: string | null; specific: string | null }> | null;
  audience: Inferred<string> | null;
  geography: Inferred<{ place: string | null; scope: ReachScope }> | null;
  personality: Inferred<string[]> | null;
  themes: { name: string; posts: number; example: string }[];
  /** Only when the account itself gives a reason (a booking link, "order online"); the person still chooses. */
  suggested_goal: { goal: MainGoalId; reason: string } | null;
  /** What the sample could not show, in plain words. */
  limitations: string[];
};

const inferred = (value: Record<string, unknown>) => ({
  type: "object",
  properties: { ...value, confidence: { type: "integer" }, evidence: { type: "array", items: { type: "string" } } },
  required: [...Object.keys(value), "confidence", "evidence"],
  additionalProperties: false,
});

export const understandingSchema = {
  type: "object",
  properties: {
    account_type: inferred({ value: { type: "string", enum: ACCOUNT_TYPES.map((t) => t.id) } }),
    niche: inferred({
      category: { type: "string", enum: NICHES },
      subcategory: { type: "string" },
      specific: { type: "string" },
    }),
    audience: inferred({ value: { type: "string" } }),
    geography: inferred({ place: { type: "string" }, scope: { type: "string", enum: REACH_SCOPES.map((s) => s.id) } }),
    personality: inferred({ value: { type: "array", items: { type: "string" } } }),
    themes: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, posts: { type: "integer" }, example: { type: "string" } },
        required: ["name", "posts", "example"],
        additionalProperties: false,
      },
    },
    suggested_goal: {
      type: "object",
      properties: { goal: { type: "string", enum: ["none", ...MAIN_GOALS.map((g) => g.id)] }, reason: { type: "string" } },
      required: ["goal", "reason"],
      additionalProperties: false,
    },
    limitations: { type: "array", items: { type: "string" } },
  },
  required: ["account_type", "niche", "audience", "geography", "personality", "themes", "suggested_goal", "limitations"],
  additionalProperties: false,
} as const;

export const UNDERSTAND_SYSTEM = `You are SOCIA's account analyst. You read a brand's real profile text and recent posts from the platforms it connected, and state what they show about the account. You never invent.

Rules:
- Every value must rest on the text you were given. evidence: 1-3 short quotes or paraphrases of specific posts or the bio that support it. No evidence means low confidence.
- confidence is 0-100 per field. 85+ only when many posts clearly agree. 40-74 when the signals are mixed. Below 40 when you are mostly guessing; say so in limitations.
- account_type: business (sells to customers: shop, restaurant, studio, service), creator (content is the product), personal_brand (a person as expert or founder), organization (nonprofit, school, club, public body).
- niche: category from the allowed list; subcategory and specific narrow it (e.g. Food & Restaurant > Pizza > Neighbourhood pizzeria). Empty string when not shown.
- geography: place only when a town, city, region or country is named in the bio or posts; otherwise empty string with scope "global" and low confidence.
- audience: who the posts address, in plain words; empty string with low confidence if unclear.
- personality: 2-4 words for the voice the captions actually use.
- themes: 2-5 recurring content themes, each with how many of the given posts show it and one short example. Never a theme from one post.
- suggested_goal: only when the account itself points to one (a booking or order link, "visit us", a product link); otherwise goal "none". reason quotes what points to it.
- limitations: what the sample cannot tell (few posts, no captions, one platform only).
- Never state reach, growth or performance numbers; those are computed elsewhere.`;

/** The model's input: profile lines, the computed facts, then the posts. */
export function understandPrompt(sample: AccountSample): string {
  const facts = sample.facts.map((f) => [
    `${f.platform}${f.handle ? ` (${f.handle})` : ""}: ${f.postsSampled} recent posts sampled`,
    f.bio ? `Bio: ${f.bio}` : null,
    f.formats.length ? `Formats: ${f.formats.map((x) => `${x.format} ${x.count}`).join(", ")}` : null,
  ].filter(Boolean).join("\n"));
  const posts = sample.posts.filter((p) => p.text).map((p) => `[${p.platform} ${p.format}${p.date ? ` ${p.date.slice(0, 10)}` : ""}] ${p.text}`);
  return `Connected accounts:\n${facts.join("\n\n")}\n\nRecent posts (newest first per platform):\n${posts.join("\n")}\n\nAllowed niche categories: ${NICHES.join(", ")}`;
}

const conf = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
const str = (v: unknown, n = 160) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const ev = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 160)).filter(Boolean).slice(0, 3) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The model's answer, kept only where it uses allowed values; anything else becomes null, never a guess. */
export function normalizeUnderstanding(raw: unknown, facts: PlatformFacts[], now: Date): Understanding {
  const r = obj(raw);
  const at = obj(r.account_type), n = obj(r.niche), au = obj(r.audience), g = obj(r.geography), p = obj(r.personality), sg = obj(r.suggested_goal);
  const type = ACCOUNT_TYPES.find((t) => t.id === at.value)?.id ?? null;
  const category = NICHES.includes(String(n.category)) ? String(n.category) : null;
  const scope = REACH_SCOPES.find((s) => s.id === g.scope)?.id ?? null;
  const goal = MAIN_GOALS.find((m) => m.id === sg.goal)?.id ?? null;
  const personality = Array.isArray(p.value) ? p.value.map((x) => str(x, 30)).filter(Boolean).slice(0, 4) : [];
  return {
    analyzed_at: now.toISOString(),
    facts,
    account_type: type ? { value: type, confidence: conf(at.confidence), evidence: ev(at.evidence) } : null,
    niche: category
      ? { value: { category, subcategory: str(n.subcategory, 60) || null, specific: str(n.specific, 80) || null }, confidence: conf(n.confidence), evidence: ev(n.evidence) }
      : null,
    audience: str(au.value) ? { value: str(au.value), confidence: conf(au.confidence), evidence: ev(au.evidence) } : null,
    geography: scope ? { value: { place: str(g.place, 80) || null, scope }, confidence: conf(g.confidence), evidence: ev(g.evidence) } : null,
    personality: personality.length ? { value: personality, confidence: conf(p.confidence), evidence: ev(p.evidence) } : null,
    themes: Array.isArray(r.themes)
      ? r.themes
          .map((t) => obj(t))
          .map((t) => ({ name: str(t.name, 50), posts: Math.max(0, Math.round(Number(t.posts) || 0)), example: str(t.example, 100) }))
          .filter((t) => t.name && t.posts >= 2)
          .slice(0, 5)
      : [],
    suggested_goal: goal && str(sg.reason) ? { goal, reason: str(sg.reason) } : null,
    limitations: Array.isArray(r.limitations) ? r.limitations.map((x) => str(x)).filter(Boolean).slice(0, 4) : [],
  };
}

/** How a confidence reads next to a finding. */
export const confidenceLabel = (c: number) => (c >= 80 ? "Clear from your posts" : c >= 55 ? "Likely" : "A guess, please check");

// SOCIA AI as a layer, not a page. One request shape for every entry point:
// the page and object the user is looking at travel with the question, the
// server assembles verified evidence for that context, and the answer comes
// back in labelled parts (observed / derived / interpretation /
// recommendation) with real actions and, where the page allows it, concrete
// proposals the user can apply. Browser-safe: no SDK imports.

export type AskPage = "global" | "dashboard" | "analytics" | "post" | "competitors" | "plan" | "studio";

export type StudioAskContext = {
  kind: "video" | "image" | "carousel";
  durationSec: number | null;
  goal: string | null;
  transcript: string | null;
  caption: string | null;
  /** The analysis the studio already produced, summarised for the model. */
  summary: string | null;
};

export type AskContext = {
  page: AskPage;
  /** Analytics: current range id and metric. */
  range?: string;
  metric?: string;
  /** A post the user is looking at (Instagram media id). */
  postId?: string;
  /** A chart day (ISO) the user clicked. */
  day?: string;
  /** Competitors: the selected account. */
  competitorId?: string;
  competitorPlatform?: string;
  competitorName?: string;
  /** Measured comparison lines from the workspace (already real numbers). */
  comparisons?: string[];
  /** Content Plan: the plan on screen and, optionally, one day of it. */
  planId?: string;
  planDay?: string;
  studio?: StudioAskContext;
};

export type PlanDayDraft = { concept: string; hook: string; format: string; rationale: string };

export type AskAction = { label: string; href: string };
export type AskProposal =
  | { kind: "plan_day"; planId: string; index: number; day: string; current: PlanDayDraft; proposed: PlanDayDraft; why: string }
  | { kind: "text"; field: "hook" | "caption" | "cta" | "onscreen"; label: string; options: string[] };
export type AskPost = { id: string; title: string; thumb: string | null; stat: string; permalink: string | null };

export type AskAnswer = {
  text: string;
  observed: string[];
  derived: string[];
  interpretation: string;
  recommendation: string;
  actions: AskAction[];
  proposals: AskProposal[];
  post: AskPost | null;
};

export type AskMessage = { role: "user" | "assistant"; content: string; answer?: AskAnswer };

export const ASK_SUGGESTIONS: Record<AskPage, string[]> = {
  global: ["What should I focus on this week?", "Show me my best content.", "Why has my engagement changed?", "Create a plan around my goal."],
  dashboard: ["What matters most right now?", "What should I post this week?", "Is my account growing?", "What am I missing?"],
  analytics: ["What caused this spike?", "Why is engagement falling?", "What format is working best?", "What should I focus on next week?", "Is my account actually growing?", "What am I missing?"],
  post: ["Why did this post perform the way it did?", "What should I do next with this?", "Which of my posts should I repeat?", "Write a follow-up caption."],
  competitors: ["Why is this competitor outperforming me?", "What are they doing differently?", "Give me an idea inspired by this without copying.", "What gap do they have that I can use?"],
  plan: ["Make Friday's post more focused on my goal.", "Give me another idea for Tuesday.", "Make this week easier to film.", "Give me 3 more Reels.", "Move my hardest posts to the weekend."],
  studio: ["How do I make the first 3 seconds better?", "Is this too long?", "Rewrite the hook.", "What caption should I use?", "What should the CTA be?", "Should I post this on Instagram or TikTok?"],
};

export const ASK_PAGE_LABEL: Record<AskPage, string> = {
  global: "Your account", dashboard: "Dashboard", analytics: "Analytics", post: "Post", competitors: "Competitors", plan: "Content Plan", studio: "Content Studio",
};

/** Which page an Ask belongs to, from the current path. */
export function pageForPath(path: string): AskPage {
  if (path.startsWith("/analytics")) return "analytics";
  if (path.startsWith("/competitors")) return "competitors";
  if (path.startsWith("/tool")) return "plan";
  if (path.startsWith("/studio")) return "studio";
  if (path.startsWith("/dashboard")) return "dashboard";
  return "global";
}

/** Open the contextual drawer from anywhere (the host lives in the top bar). */
export type AskEvent = { question?: string | null; context?: Partial<AskContext>; autoSend?: boolean; contextLabel?: string | null };
export const ASK_EVENT = "socia-ask";
export function askSocia(detail: AskEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AskEvent>(ASK_EVENT, { detail }));
}

// The model's output contract (structured outputs). Action types are mapped to
// real routes on the server; the model never writes URLs.
export const ACTION_TYPES = ["content_plan", "calendar", "analytics", "content", "competitors", "studio", "reports", "post"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export type ModelAnswer = {
  text: string;
  observed: string[];
  derived: string[];
  interpretation: string;
  recommendation: string;
  actions: { type: ActionType; label: string; note: string }[];
  proposals: {
    kind: "plan_day" | "text" | "none";
    index: number;
    concept: string;
    hook: string;
    format: string;
    rationale: string;
    why: string;
    field: "hook" | "caption" | "cta" | "onscreen" | "none";
    label: string;
    options: string[];
  }[];
  postId: string;
};

export const askAnswerSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string" },
    observed: { type: "array", items: { type: "string" } },
    derived: { type: "array", items: { type: "string" } },
    interpretation: { type: "string" },
    recommendation: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { type: { type: "string", enum: [...ACTION_TYPES] }, label: { type: "string" }, note: { type: "string" } },
        required: ["type", "label", "note"],
      },
    },
    proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["plan_day", "text", "none"] },
          index: { type: "integer" },
          concept: { type: "string" },
          hook: { type: "string" },
          format: { type: "string" },
          rationale: { type: "string" },
          why: { type: "string" },
          field: { type: "string", enum: ["hook", "caption", "cta", "onscreen", "none"] },
          label: { type: "string" },
          options: { type: "array", items: { type: "string" } },
        },
        required: ["kind", "index", "concept", "hook", "format", "rationale", "why", "field", "label", "options"],
      },
    },
    postId: { type: "string" },
  },
  required: ["text", "observed", "derived", "interpretation", "recommendation", "actions", "proposals", "postId"],
} as const;

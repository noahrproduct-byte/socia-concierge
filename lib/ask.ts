// SOCIA AI as a layer, not a page. One request shape for every entry point:
// the page and object the user is looking at travel with the question, the
// server assembles verified evidence for that context, and the answer comes
// back in labelled parts (observed / derived / interpretation /
// recommendation) with real actions and, where the page allows it, concrete
// proposals the user can apply. Browser-safe: no SDK imports.

import type { AskInstagram, AskRatedVideo } from "./assistant/askExtras";
import type { ResearchExample } from "./research/examples";
import type { IntentKind } from "./research/intent";
import type { CreativeDirection, CreativeStyle } from "./research/direction";
import type { CreativeBrief, Deliverable } from "./assistant/brief";

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
  /** The viewer's IANA time zone, for scheduling in their own clock. */
  tz?: string;
  /** Drafts the person made from footage in this chat ("schedule these"). */
  newPosts?: string[];
  /** Videos rated in Content Studio in this tab ("the video I just rated"); lib/assistant/rated.ts. */
  rated?: AskRatedVideo[];
  /** The creative brief SOCIA returned with its last answer in this chat (lib/assistant/brief.ts). */
  brief?: CreativeBrief | null;
  /** The creative direction the person chose from a reference gallery in this chat (lib/research/direction.ts). */
  direction?: CreativeDirection | null;
  /** This message is the one that chose the direction (a gallery button): write in it now, no new research. */
  choseNow?: boolean;
  /** "Show different examples": the gallery's links so far, to leave out of the next search. */
  moreRefs?: string[];
};

export type PlanDayDraft = { concept: string; hook: string; format: string; rationale: string };

export type AskAction = { label: string; href: string };
/** One post in a schedule proposal: where it is now and where SOCIA would put it. */
export type AskScheduleItem = {
  postId: string;
  title: string;
  status: "draft" | "scheduled";
  /** current time for a scheduled post; null for a draft */
  from: string | null;
  at: string;
  reason: string;
  /** a Create Post item (it publishes to these platforms); false = a calendar row with no destinations yet */
  platforms: string[];
  /** a post saved before multi-platform publishing: moved by time only */
  legacy: boolean;
  /** a video rated in Content Studio, not a post yet: [V#], saved as a post when the schedule is confirmed */
  rated?: string;
  /** a new video idea, not made yet: saved on confirm as a draft with no media at this time */
  idea?: AskIdea;
};
/** A video the person will film or make later: what goes in the draft's caption until then. */
export type AskIdea = { hook: string; concept: string };
export type AskProposal =
  | { kind: "plan_day"; planId: string; index: number; day: string; current: PlanDayDraft; proposed: PlanDayDraft; why: string }
  | { kind: "schedule"; summary: string; items: AskScheduleItem[]; left: { title: string; reason: string }[]; instagram?: AskInstagram | null }
  | { kind: "text"; field: "hook" | "caption" | "cta" | "onscreen"; label: string; options: string[] };
export type AskPost = { id: string; title: string; thumb: string | null; stat: string; permalink: string | null };

/** Where a research answer's next step goes (lib/research/steps.ts maps it to a page). */
export const RESEARCH_STEPS = ["content_plan", "writer", "editor", "idea"] as const;
export type ResearchStep = (typeof RESEARCH_STEPS)[number];

/** A research answer (create a video, study a niche, recreate a reference): shown as its own card. */
export type AskResearch = {
  kind: IntentKind;
  /** the recommended approach, in two sentences */
  approach: string;
  /** real videos SOCIA found, each with why it is comparable; every number comes from the platform */
  examples: (ResearchExample & { why: string; letter: string; style: CreativeStyle; techniques: string[] })[];
  /** how the research supports the approach: patterns, kept apart from guesses */
  why: string;
  /** how to judge the result after posting */
  test: string;
  steps: AskAction[];
  /** what SOCIA searched and what it couldn't */
  notes: string[];
};

export type AskAnswer = {
  text: string;
  /** present when the request called for research */
  research?: AskResearch | null;
  observed: string[];
  derived: string[];
  interpretation: string;
  recommendation: string;
  actions: AskAction[];
  proposals: AskProposal[];
  post: AskPost | null;
  /** Something the person asked SOCIA to write (a script, caption, hooks, a reply), in full. */
  draft?: AskDraft | null;
  /** The creative brief after this answer: sent back with the next message (lib/assistant/brief.ts). */
  brief?: CreativeBrief | null;
  /** The deliverable this answer was written as, for the actions shown under it. */
  deliverable?: Deliverable;
  /** Whether "photos of your place" applies (a business customers visit, with a filmed script). */
  placeScan?: boolean;
  /** Said under the answer when a check found something SOCIA couldn't fix (an answer cut off, a wrong claim). */
  notice?: string | null;
};

export type AskDraftKind = "script" | "caption" | "hooks" | "reply" | "other";
export type AskDraft = { kind: AskDraftKind; title: string; body: string; /** spoken length at about 2.5 words a second */ seconds?: number | null };

export type AskMessage = {
  role: "user" | "assistant"; content: string; answer?: AskAnswer;
  /** a user message that chose a creative direction */
  direction?: CreativeDirection;
  /** drafts this turn saved from footage the person added in the chat */
  drafts?: string[];
};

export const ASK_SUGGESTIONS: Record<AskPage, string[]> = {
  global: ["What should I focus on this week?", "Show me my best content.", "Why has my engagement changed?", "Create a plan around my goal."],
  dashboard: ["What matters most right now?", "What should I post this week?", "Is my account growing?", "What am I missing?"],
  analytics: ["What caused this spike?", "Why is engagement falling?", "What format is working best?", "What should I focus on next week?", "Is my account actually growing?", "What am I missing?"],
  post: ["Why did this post perform the way it did?", "What should I do next with this?", "Which of my posts should I repeat?", "Write a follow-up caption."],
  competitors: ["Why is this competitor outperforming me?", "What are they doing differently?", "Give me an idea inspired by this without copying.", "What gap do they have that I can use?"],
  plan: ["Make Friday's post more focused on my goal.", "Give me another idea for Tuesday.", "Make this week easier to film.", "Give me 3 more Reels.", "Move my hardest posts to the weekend."],
  studio: ["How do I make the first 3 seconds better?", "Is this too long?", "Rewrite the hook.", "What caption should I use?", "What should the CTA be?", "Schedule this for Friday at 6 PM as a Trial Reel."],
};

export const ASK_PAGE_LABEL: Record<AskPage, string> = {
  global: "Your account", dashboard: "Dashboard", analytics: "Analytics", post: "Post", competitors: "Discover", plan: "Plan", studio: "Content Studio",
};

/** Which page an Ask belongs to, from the current path. */
export function pageForPath(path: string): AskPage {
  if (path.startsWith("/analytics")) return "analytics";
  if (path.startsWith("/discover")) return "competitors";
  // The Calendar sits under Plan but asks about the whole account.
  if (path.startsWith("/plan/calendar")) return "global";
  if (path === "/plan" || path.startsWith("/plan?")) return "plan";
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
  /** The creative brief as the model updated it this turn (lib/assistant/brief.ts sanitizes and merges it). */
  brief?: Partial<CreativeBrief> | null;
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
  /** kind "none" when nothing was asked to be written */
  draft: { kind: AskDraftKind | "none"; title: string; body: string };
  /** a research answer; approach "" and examples [] when the request wasn't one */
  research: { approach: string; examples: { ref: string; why: string; style: CreativeStyle; techniques: string[] }[]; why: string; test: string; steps: { type: ResearchStep; label: string }[] };
  postId: string;
  /** Scheduling: what the person asked for, in their own terms. The server works out the times. */
  schedule: {
    want: boolean;
    /** the [S#] numbers of the posts meant; empty = every draft listed */
    posts: number[];
    startLocal: string;
    spacingMinutes: number;
    perDay: number;
    times: string[];
    days: number;
    /** the [V#] refs of rated videos meant */
    videos: string[];
    /** "yes" | "no" | "unchanged" */
    trialReel: string;
    /** "manual" | "if_performing" | "default" */
    trialShare: string;
    /** Instagram usernames named as collaborators */
    collaborators: string[];
    /** New video ideas to put on the calendar as drafts, one per slot, when they ask for ideas rather than existing posts */
    ideas: { title: string; hook: string; concept: string }[];
  };
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
    draft: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["none", "script", "caption", "hooks", "reply", "other"] },
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["kind", "title", "body"],
    },
    brief: {
      type: "object",
      additionalProperties: false,
      properties: {
        contentType: { type: "string" }, topic: { type: "string" }, audience: { type: "string" }, platform: { type: "string" },
        goal: { type: "string" }, hook: { type: "string" }, duration: { type: "string" }, mustInclude: { type: "array", items: { type: "string" } },
        tone: { type: "string" }, structure: { type: "string" }, cta: { type: "string" },
      },
      required: ["contentType", "topic", "audience", "platform", "goal", "hook", "duration", "mustInclude", "tone", "structure", "cta"],
    },
    research: {
      type: "object",
      additionalProperties: false,
      properties: {
        approach: { type: "string" },
        // style stays a plain string: an enum here pushed the compiled grammar over Anthropic's limit and
        // every Ask request failed (2026-11-20). The prompt lists the style ids; buildResearch keeps only valid ones.
        examples: { type: "array", items: { type: "object", additionalProperties: false, properties: { ref: { type: "string" }, why: { type: "string" }, style: { type: "string" }, techniques: { type: "array", items: { type: "string" } } }, required: ["ref", "why", "style", "techniques"] } },
        why: { type: "string" },
        test: { type: "string" },
        steps: { type: "array", items: { type: "object", additionalProperties: false, properties: { type: { type: "string", enum: [...RESEARCH_STEPS] }, label: { type: "string" } }, required: ["type", "label"] } },
      },
      required: ["approach", "examples", "why", "test", "steps"],
    },
    schedule: {
      type: "object",
      additionalProperties: false,
      properties: {
        want: { type: "boolean" },
        posts: { type: "array", items: { type: "integer" } },
        startLocal: { type: "string" },
        spacingMinutes: { type: "integer" },
        perDay: { type: "integer" },
        times: { type: "array", items: { type: "string" } },
        days: { type: "integer" },
        videos: { type: "array", items: { type: "string" } },
        trialReel: { type: "string", enum: ["unchanged", "yes", "no"] },
        trialShare: { type: "string", enum: ["default", "manual", "if_performing"] },
        collaborators: { type: "array", items: { type: "string" } },
        ideas: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { title: { type: "string" }, hook: { type: "string" }, concept: { type: "string" } },
            required: ["title", "hook", "concept"],
          },
        },
      },
      required: ["want", "posts", "startLocal", "spacingMinutes", "perDay", "times", "days", "videos", "trialReel", "trialShare", "collaborators", "ideas"],
    },
  },
  required: ["text", "observed", "derived", "interpretation", "recommendation", "actions", "proposals", "postId", "draft", "brief", "research", "schedule"],
} as const;

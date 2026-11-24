// The shape of the deliverable Claude returns. Used both as the JSON Schema
// passed to the API (structured outputs) and as the TypeScript type on the
// client. Keep the two in sync.

export type Deliverable = {
  clientHandle: string;
  niche: string;
  platform: string;
  /** Older plans carry a model-written 0-100 score. It was never measured, so nothing shows it. */
  healthScore?: number;
  headline: string; // one-line diagnosis
  /** The person's own ideas (lib/planIdeas.ts) that no post of this plan was made from. Set by SOCIA, not the model. */
  ideasLeft?: string[];
  /** A plan built one day at a time (lib/planSteps.ts): where each day stands. Absent on plans built in one go. */
  build?: PlanBuild;
  auditSummary: string; // 2-4 sentence plain-English read
  strengths: string[];
  problems: { issue: string; evidence: string; impact: string }[];
  topFixes: { fix: string; why: string; expectedImpact: string }[]; // 3, ranked
  competitorInsights: {
    competitor: string;
    whatsWorking: string;
    format: string;
    whyItWins: string;
    gap: string; // what they do that this account doesn't
    /** "measured" when it rests on numbers SOCIA read for that account; "general" for a pattern from general knowledge, which names no account. Older plans lack it. */
    basis?: "measured" | "general";
  }[];
  weeklyPlan: {
    day: string;
    concept: string;
    hook: string; // the actual written first line
    format: string; // Reel / carousel / static / story
    rationale: string;
    evidence: string; // which competitor/pattern it's derived from
    predictedPerformance: string; // e.g. "High confidence" / "Experiment"
    // Plans written since Milestone 4 carry these; older saved plans don't.
    /** A short working title for the post. */
    title?: string;
    /** Which strategy pillar or priority it serves. */
    purpose?: string;
    /** Who it is for. */
    audience?: string;
    /** Where it goes: Instagram, Facebook, YouTube or TikTok. */
    platform?: string;
    /** Shots, look, pacing: how it should feel. */
    direction?: string;
    /** What it takes to make: people, gear, time, within the person's stated resources. */
    production?: string;
    /** The video as 3 or 4 timed beats (the hook, then what happens, then the ending), for the storyboard. Plans before 2026-11-14 lack them. */
    beats?: PlanBeat[];
    /** The one number that says whether it worked, against the account's own median. */
    successMetric?: string;
    /** The one action the post asks the viewer to take, in the account's words. Plans before 2026-11-17 lack it. */
    cta?: string;
    /** How to edit it: cuts, captions, pacing, within the editing skill the person has. Plans before 2026-11-17 lack it. */
    editing?: string;
    /** The account's own posts this one draws on, as SOCIA read them (from the P# ids the model cited). Set by SOCIA, never by the model. */
    ownPosts?: import("./planEvidenceFormat").OwnPostRef[];
    /** The evidence kept in three kinds: what SOCIA's numbers show, what the AI reads into them, and what to expect (a guess). Plans before 2026-11-17 lack it. */
    evidenceSplit?: EvidenceSplit;
    /** The running experiment this post tests (its id in the Growth Strategy), when it tests one. */
    experiment?: string;
    /** For a filmed post: what to copy from its example Reel when filming (framing, camera, setting, pacing), never its words. Plans before 2026-11-23 lack it. */
    filmLike?: string;
    /** The id of the listed Reel to film from ("R5"), as the model wrote it; replaced by `filmRef`. Can differ from `reference` (the idea). */
    filmReference?: string;
    /** The Reel to film from: made the same way as this post is filmed, never animated or slides. Set by SOCIA from `filmReference`. */
    filmRef?: import("./trendSignals").ReelRef;
    /** The id of the niche Reel the model built this post on ("R2"), as it wrote it; replaced by `ref` when the plan is saved. */
    reference?: string;
    /** The niche Reel this post is built on, with the numbers SOCIA read for it (lib/trendSignals.ts ReelRef). Set by SOCIA from `reference`, never by the model. */
    ref?: import("./trendSignals").ReelRef;
    /** An animated post SOCIA added because the brand posts animated videos (lib/animated/planPosts.ts); its day reads "Monday (animated)". Not part of the model's schema. */
    animated?: boolean;
    /** Which of the day's animated posts this is, when there are two a day. Not part of the model's schema. */
    slot?: 1 | 2;
    /** Who makes the video: the person ("you") or their own Claude ("claude", lib/claudeWeek). Older plans lack it: "you". */
    maker?: "you" | "claude";
    /** The post's own id, assigned by SOCIA when the plan is saved (lib/planItems.ts withItemIds). Not part of the model's schema. */
    id?: string;
    /** "own" when the person added the idea themselves; SOCIA's otherwise. Not part of the model's schema. */
    source?: "socia" | "own";
    /** The person's call on the idea, and why when they turned it down. Not part of the model's schema. */
    decision?: PlanDecision;
    /** How far the person says they have got with making it (lib/planStage.ts). Not part of the model's schema. */
    made?: PlanMade;
    /** Studio's production guide for this post, once written (lib/studioGuide.ts). Not part of the model's schema. */
    guide?: ProductionGuide;
  }[];
  /** Attached by the server after generation; not part of the model's schema. */
  evidenceUsed?: EvidenceUsed;
  /** How many seconds building this plan took (lib/planGenerate.ts), for the next plan's time estimate. Not part of the model's schema. */
  buildSeconds?: number;
};

import type { ProductionGuide } from "./studioGuide";

/** One timed beat of a planned video: "The problem", 0 to 7 seconds, what is on screen, and the words said or written. */
/**
 * One timed shot of a planned video. `frameJob` and `frame` are set only by "Draw the storyboard"
 * (lib/storyboardDraw.ts): the image job while it draws, then the stored drawing's path in the owner's
 * ai-media folder (turned into a link on the server, never used as one directly).
 */
/** A day's short idea, before its full post is written (lib/planSteps.ts). */
export type IdeaCard = { title: string; pillar: string; description: string; format: string; template?: "compare" | "counter" | "words"; /** Animated days only: the first line a viewer reads. */ hook?: string; fromIdea?: number };

/** One day of a plan built one day at a time. `key` is the day its post is saved under ("Monday", "Monday (animated)"). */
export type BuildSlot = {
  key: string;
  /** 0 Monday to 6 Sunday. */
  weekday: number;
  kind: "filmed" | "animated";
  slot?: 1 | 2;
  /** waiting: no idea yet; reviewing: the person decides; writing: accepted, its full post is being written; done; failed: the post couldn't be written. */
  state: "waiting" | "reviewing" | "writing" | "done" | "failed";
  idea?: IdeaCard;
  /** Ideas shown for this day before the current one. */
  earlier: IdeaCard[];
  /** "Try another idea" used for this day. */
  tries: number;
  /** Attempts at writing the full post. */
  writes?: number;
  /** The weeklyPlan item written for it. */
  itemId?: string;
  error?: string;
};

export type PlanBuild = {
  v: 1;
  /** Goes up by one with every save, so two saves at once never overwrite each other (lib/planStepsServer.ts). */
  rev: number;
  status: "building" | "done";
  startedAt: string;
  /** The form as it was when the plan started, so every step reads the same brief. */
  input: GenerateInput;
  slots: BuildSlot[];
  /** The week-level read (headline, audit, fixes, competitors), written once every day is approved. */
  audit?: "writing" | "done" | "failed";
};

export type PlanBeat = { label: string; from: number; to: number; show: string; say?: string; frameJob?: string; frame?: string };

/**
 * A planned post's evidence in three kinds that are never mixed. `observed`
 * lines restate numbers from the evidence and each names the id it comes from
 * (P# for the account's own posts, R# for niche Reels); SOCIA drops any that
 * doesn't. `basis` is "thin" when there is too little of the account's own data
 * to stand on, and "experiment" when the post is a test.
 */
export type EvidenceSplit = { observed: string[]; reading: string; expect: string; basis: "data" | "thin" | "experiment" };

/** The person's own word that a planned video is filmed, or filmed and edited. */
export type PlanMade = { step: "filmed" | "edited"; at: string };

export type PlanDecision = { status: "approved" | "rejected"; at: string; reasons?: string[]; note?: string | null };

// JSON Schema for the Messages API `output_config.format`. Structured outputs
// require `additionalProperties: false` and `required` on every object.
export const deliverableSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    clientHandle: { type: "string" },
    niche: { type: "string" },
    platform: { type: "string" },
    headline: { type: "string" },
    auditSummary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    problems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          issue: { type: "string" },
          evidence: { type: "string" },
          impact: { type: "string" },
        },
        required: ["issue", "evidence", "impact"],
      },
    },
    topFixes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fix: { type: "string" },
          why: { type: "string" },
          expectedImpact: { type: "string" },
        },
        required: ["fix", "why", "expectedImpact"],
      },
    },
    competitorInsights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          competitor: { type: "string" },
          whatsWorking: { type: "string" },
          format: { type: "string" },
          whyItWins: { type: "string" },
          gap: { type: "string" },
          basis: { type: "string", enum: ["measured", "general"] },
        },
        required: ["competitor", "whatsWorking", "format", "whyItWins", "gap", "basis"],
      },
    },
    weeklyPlan: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          day: { type: "string" },
          concept: { type: "string" },
          hook: { type: "string" },
          format: { type: "string" },
          rationale: { type: "string" },
          evidence: { type: "string" },
          predictedPerformance: { type: "string" },
          title: { type: "string" },
          purpose: { type: "string" },
          audience: { type: "string" },
          platform: { type: "string" },
          direction: { type: "string" },
          production: { type: "string" },
          successMetric: { type: "string" },
          experiment: { type: "string" },
          beats: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { label: { type: "string" }, from: { type: "integer" }, to: { type: "integer" }, show: { type: "string" }, say: { type: "string" } },
              required: ["label", "from", "to", "show", "say"],
            },
          },
          maker: { type: "string", enum: ["you", "claude"] },
          reference: { type: "string" },
          filmReference: { type: "string" },
          filmLike: { type: "string" },
          cta: { type: "string" },
          editing: { type: "string" },
          ownRefs: { type: "array", items: { type: "string" } },
          fromIdea: { type: "integer" },
          evidenceSplit: {
            type: "object",
            additionalProperties: false,
            properties: {
              observed: { type: "array", items: { type: "string" } },
              reading: { type: "string" },
              expect: { type: "string" },
              basis: { type: "string", enum: ["data", "thin", "experiment"] },
            },
            required: ["observed", "reading", "expect", "basis"],
          },
        },
        required: [
          "maker",
          "reference",
          "filmReference",
          "filmLike",
          "cta",
          "editing",
          "ownRefs",
          "fromIdea",
          "evidenceSplit",
          "day",
          "concept",
          "hook",
          "format",
          "rationale",
          "evidence",
          "predictedPerformance",
          "title",
          "purpose",
          "audience",
          "platform",
          "direction",
          "production",
          "successMetric",
          "experiment",
          "beats",
        ],
      },
    },
  },
  required: [
    "clientHandle",
    "niche",
    "platform",
    "headline",
    "auditSummary",
    "strengths",
    "problems",
    "topFixes",
    "competitorInsights",
    "weeklyPlan",
  ],
};

// Shape of the form the SMM fills in.
export type GenerateInput = {
  clientHandle: string;
  niche: string;
  platform: string;
  brandVoice: string;
  recentPosts: string;
  competitors: string;
  goal: string;
  /** The person's own video ideas for this week, one per line (lib/planIdeas.ts). Optional. */
  ideas?: string;
  /** Audience timing, computed in the browser (viewer's time zone) from the
   *  account's own posts. Optional; empty when there isn't enough data. */
  audienceWindows?: string;
  /** How many filmed (on-camera) posts this week, from the plan form or the brand's last plan (lib/planMix.ts). Unset: the strategist's own 5 to 7, or the strategy's pace. */
  onCamera?: number;
  /** How many animated posts this week (lib/animated/planPosts.ts). Unset: the brand's animated setting. */
  animated?: number;
  /** Competitors (handles) the person unticked on the form: left out of this plan. */
  skipCompetitors?: string[];
};

/** What a plan was actually built from. Stored with the plan so history is
 *  honest about it. Zero means that source contributed nothing. */
export type EvidenceUsed = {
  posts: number;
  competitors: number;
  winning: number;
  windows: boolean;
  followers: number | null;
  /** Planned posts from earlier plans whose outcome (posted / skipped / result vs median) the strategist was shown. Absent on plans made before outcomes existed. */
  outcomes?: number;
  /** Recent Reels from the niche the trends (hooks, topics, opening lines) were read from. Absent on plans made before trends existed. */
  trends?: number;
  /** Planned posts built on a niche Reel that took off. Absent on plans made before references existed. */
  references?: number;
};

// A plan saved to the database (one row in the `plans` table).
export type SavedPlan = {
  id: string;
  client_handle: string | null;
  niche: string | null;
  platform: string | null;
  data: Deliverable;
  created_at: string;
};

// "What's winning in your niche" v2 — the full AI intelligence document.
// All percentages are the model's own market estimates (the UI labels them
// as AI-estimated signals); fit fields are personalized when account context
// was available at generation time.
export type PulseRow = { label: string; change_pct: number }; // negative = declining

export type NicheIntel = {
  v: number; // 2 — used to invalidate old cached shapes
  niche: string;
  summary: string;
  stats: {
    rising_formats: number;
    opportunity_hooks: number;
    competitor_patterns: number;
    momentum_label: string; // e.g. "POV content"
    momentum_pct: number;
  };
  breakout: {
    title: string;
    format: string; // Reel / Carousel / ...
    momentum_pct: number;
    cover_line: string; // short overlay text for the concept preview
    why_moving: string;
    angle_hook: string; // the actual first line, quoted in the UI
    velocity: string; // High / Medium / Low
    competition: string;
    fit_pct: number; // 0 when no account context was available
    audience_overlap: string;
    opportunity: string;
    why_fits_you: string;
  };
  pulse: {
    formats: PulseRow[];
    topics: PulseRow[];
    hooks: PulseRow[];
  };
  trends: {
    title: string;
    momentum_pct: number; // negative = cooling
    competition: string; // Low / Medium / High — for the opportunity map
    why: string;
    hook: string;
  }[];
  actions: { title: string; reason: string; impact: string }[];
};

const pulseRowSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    properties: { label: { type: "string" }, change_pct: { type: "integer" } },
    required: ["label", "change_pct"],
  },
};

export const nicheIntelSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    v: { type: "integer" },
    niche: { type: "string" },
    summary: { type: "string" },
    stats: {
      type: "object",
      additionalProperties: false,
      properties: {
        rising_formats: { type: "integer" },
        opportunity_hooks: { type: "integer" },
        competitor_patterns: { type: "integer" },
        momentum_label: { type: "string" },
        momentum_pct: { type: "integer" },
      },
      required: [
        "rising_formats",
        "opportunity_hooks",
        "competitor_patterns",
        "momentum_label",
        "momentum_pct",
      ],
    },
    breakout: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        format: { type: "string" },
        momentum_pct: { type: "integer" },
        cover_line: { type: "string" },
        why_moving: { type: "string" },
        angle_hook: { type: "string" },
        velocity: { type: "string" },
        competition: { type: "string" },
        fit_pct: { type: "integer" },
        audience_overlap: { type: "string" },
        opportunity: { type: "string" },
        why_fits_you: { type: "string" },
      },
      required: [
        "title",
        "format",
        "momentum_pct",
        "cover_line",
        "why_moving",
        "angle_hook",
        "velocity",
        "competition",
        "fit_pct",
        "audience_overlap",
        "opportunity",
        "why_fits_you",
      ],
    },
    pulse: {
      type: "object",
      additionalProperties: false,
      properties: {
        formats: pulseRowSchema,
        topics: pulseRowSchema,
        hooks: pulseRowSchema,
      },
      required: ["formats", "topics", "hooks"],
    },
    trends: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          momentum_pct: { type: "integer" },
          competition: { type: "string" },
          why: { type: "string" },
          hook: { type: "string" },
        },
        required: ["title", "momentum_pct", "competition", "why", "hook"],
      },
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          reason: { type: "string" },
          impact: { type: "string" },
        },
        required: ["title", "reason", "impact"],
      },
    },
  },
  required: ["v", "niche", "summary", "stats", "breakout", "pulse", "trends", "actions"],
};

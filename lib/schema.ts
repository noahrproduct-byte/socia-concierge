// The shape of the deliverable Claude returns. Used both as the JSON Schema
// passed to the API (structured outputs) and as the TypeScript type on the
// client. Keep the two in sync.

export type Deliverable = {
  clientHandle: string;
  niche: string;
  platform: string;
  healthScore: number; // 0-100
  headline: string; // one-line diagnosis
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
  }[];
  weeklyPlan: {
    day: string;
    concept: string;
    hook: string; // the actual written first line
    format: string; // Reel / carousel / static / story
    rationale: string;
    evidence: string; // which competitor/pattern it's derived from
    predictedPerformance: string; // e.g. "High confidence" / "Experiment"
  }[];
};

// JSON Schema for the Messages API `output_config.format`. Structured outputs
// require `additionalProperties: false` and `required` on every object.
export const deliverableSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    clientHandle: { type: "string" },
    niche: { type: "string" },
    platform: { type: "string" },
    healthScore: { type: "integer" },
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
        },
        required: ["competitor", "whatsWorking", "format", "whyItWins", "gap"],
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
        },
        required: [
          "day",
          "concept",
          "hook",
          "format",
          "rationale",
          "evidence",
          "predictedPerformance",
        ],
      },
    },
  },
  required: [
    "clientHandle",
    "niche",
    "platform",
    "healthScore",
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
    why: string;
    hook: string;
  }[];
  actions: { title: string; reason: string }[];
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
          why: { type: "string" },
          hook: { type: "string" },
        },
        required: ["title", "momentum_pct", "why", "hook"],
      },
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, reason: { type: "string" } },
        required: ["title", "reason"],
      },
    },
  },
  required: ["v", "niche", "summary", "stats", "breakout", "pulse", "trends", "actions"],
};

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

// "What's working in your niche" — AI-generated, cached per niche.
export type NicheTrends = {
  niche: string;
  summary: string;
  trends: {
    title: string;
    format: string;
    whyItWorks: string;
    exampleHook: string;
    momentum: string; // "Hot" | "Rising" | "Steady"
  }[];
  topHooks: string[];
  formats: { name: string; note: string }[];
};

export const nicheTrendsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    niche: { type: "string" },
    summary: { type: "string" },
    trends: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          format: { type: "string" },
          whyItWorks: { type: "string" },
          exampleHook: { type: "string" },
          momentum: { type: "string" },
        },
        required: ["title", "format", "whyItWorks", "exampleHook", "momentum"],
      },
    },
    topHooks: { type: "array", items: { type: "string" } },
    formats: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string" }, note: { type: "string" } },
        required: ["name", "note"],
      },
    },
  },
  required: ["niche", "summary", "trends", "topHooks", "formats"],
};

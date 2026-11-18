// What a request to Ask SOCIA is really about, and which evidence answers it.
// Research follows the question: "why did my views drop" reads the account,
// "help me pitch my SaaS in a Reel" studies comparable public videos, "what
// should I post next week" combines the account with the niche. The model
// reads the request into a ResearchIntent (INTENT_SCHEMA); when it can't,
// guessIntent reads it from the words alone. planSources then picks the
// sources, the same way for both. Browser-safe: no SDK or server imports.

export const INTENT_KINDS = [
  "create_content",   // write or plan one piece: a script, a pitch, a hook, a video idea
  "niche_research",   // what's working in a niche: hooks, formats, topics
  "reference_style",  // recreate a supplied video's style or edit
  "own_performance",  // why did my numbers change, what's working for me
  "improve_post",     // make one of my posts or videos better
  "plan_week",        // what to post next: a plan, a week, a calendar
  "competitor",       // about a named competitor
  "schedule",         // move or schedule posts
  "general",          // anything else
] as const;
export type IntentKind = (typeof INTENT_KINDS)[number];

export type ResearchIntent = {
  kind: IntentKind;
  /** what the person is trying to achieve, in a few words */
  goal: string;
  /** the subject of the content, in a few words ("" when the question isn't about content) */
  topic: string;
  /** the content format asked for ("talking head", "POV sketch", "product demo"; "" when not named) */
  format: string;
  /** where it will be posted ("instagram", "tiktok", "youtube" or "") */
  platform: string;
  /** who it is for ("potential customers", "gym beginners"; "" when not named) */
  audience: string;
  /** what a good result looks like ("sign-ups", "bookings", "more views") */
  outcome: string;
  /** public video searches that would find comparable successful short videos (2 at most, empty when none help) */
  queries: string[];
};

/** For the model: read the request into an intent. Kept small so it runs fast before the research. */
export const INTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: [...INTENT_KINDS] },
    goal: { type: "string" },
    topic: { type: "string" },
    format: { type: "string" },
    platform: { type: "string" },
    audience: { type: "string" },
    outcome: { type: "string" },
    queries: { type: "array", items: { type: "string" } },
  },
  required: ["kind", "goal", "topic", "format", "platform", "audience", "outcome", "queries"],
} as const;

export const INTENT_PROMPT = `You read one request to SOCIA, a social media assistant, and say what it is about. Reply with JSON only.
- kind: create_content (write or plan one piece: a script, pitch, hook, video idea, caption), niche_research (what is working in a niche: hooks, formats, topics), reference_style (recreate a video they supplied or linked), own_performance (why their numbers changed, what is working for them), improve_post (improve one of their posts or videos), plan_week (what to post next, a week, a plan, a calendar), competitor (about a named competitor), schedule (schedule or move posts), general.
- goal, topic, format, platform, audience, outcome: a few plain words each, from the request and the brand; "" when unknown. Never invent a product detail.
- queries: for create_content, niche_research and plan_week, up to 2 YouTube searches that would find successful short videos comparable to what they want, by technique and subject, not by their brand name. Example: a founder wanting a talking-head Reel pitching their AI social media app -> ["founder pitches saas app shorts", "ai software demo talking head short"]. A restaurant promo -> ["restaurant promo reel", "pizza restaurant short video"]. Otherwise [].`;

/** Which evidence a request gets. */
export type SourcePlan = {
  /** the person's account: everything (posts, KPIs, insights), a short summary, or nothing */
  account: "full" | "summary" | "none";
  /** public videos found for this request (YouTube Data API search) */
  external: boolean;
  /** the niche read SOCIA holds: competitors' Reels, trending hooks and topics */
  niche: boolean;
  /** the competitor list and their analysed content */
  competitors: boolean;
  /** a video the person linked in the message */
  reference: boolean;
  /** one post of theirs to look at closely */
  post: boolean;
  /** why, in one line, for the "what SOCIA researched" note */
  why: string;
};

/** The sources each kind of request needs. A page can add to them (a competitor page always has its competitor). */
export function planSources(intent: Pick<ResearchIntent, "kind" | "queries">, opts: { linkInQuestion?: boolean; page?: string } = {}): SourcePlan {
  const ext = intent.queries.length > 0;
  let p: SourcePlan;
  switch (intent.kind) {
    case "own_performance":
      p = { account: "full", external: false, niche: false, competitors: false, reference: false, post: false, why: "Your account's own history answers this." };
      break;
    case "improve_post":
      p = { account: "full", external: false, niche: false, competitors: false, reference: false, post: true, why: "The post itself, against your own medians." };
      break;
    case "create_content":
      p = { account: "summary", external: ext, niche: true, competitors: false, reference: false, post: false, why: "Comparable public videos for this request, plus what's working in your niche." };
      break;
    case "niche_research":
      p = { account: "none", external: ext, niche: true, competitors: true, reference: false, post: false, why: "Recent videos from your niche and comparable creators." };
      break;
    case "reference_style":
      p = { account: "none", external: false, niche: false, competitors: false, reference: true, post: false, why: "The reference video you supplied." };
      break;
    case "plan_week":
      p = { account: "full", external: ext, niche: true, competitors: true, reference: false, post: false, why: "Your account's results plus your niche and competitors." };
      break;
    case "competitor":
      p = { account: "summary", external: false, niche: false, competitors: true, reference: false, post: false, why: "The competitor's measured numbers against yours." };
      break;
    case "schedule":
      p = { account: "none", external: false, niche: false, competitors: false, reference: false, post: false, why: "Your drafts and scheduled posts." };
      break;
    default:
      p = { account: "full", external: false, niche: false, competitors: false, reference: false, post: false, why: "Your account's data." };
  }
  if (opts.linkInQuestion && intent.kind !== "own_performance") p = { ...p, reference: true };
  if (opts.page === "competitors") p = { ...p, competitors: true };
  return p;
}

const has = (t: string, re: RegExp) => re.test(t);

/** A video link in the message (YouTube, Instagram, TikTok), if any. */
export function linkIn(text: string): string | null {
  const m = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be|instagram\.com|tiktok\.com|vm\.tiktok\.com)\/\S+/i.exec(text);
  return m ? m[0].replace(/[).,]+$/, "") : null;
}

/** Search words: the topic and format, without filler. */
function queryFrom(topic: string, format: string): string {
  return `${topic} ${format}`.replace(/\b(a|an|the|my|our|for|to|of|and|about|reel|reels|video|videos|i|we|want|how|do)\b/gi, " ").replace(/\s+/g, " ").trim();
}

/**
 * The intent from the words alone, when the model's read isn't available.
 * Coarse on purpose: it decides the sources; the answer still reads the request.
 */
export function guessIntent(question: string, opts: { page?: string; niche?: string | null } = {}): ResearchIntent {
  const t = question.toLowerCase();
  const platform = has(t, /tiktok/) ? "tiktok" : has(t, /youtube|shorts?\b/) ? "youtube" : has(t, /instagram|\breels?\b|\big\b/) ? "instagram" : "";
  const format = has(t, /talking[- ]head|to camera|face to camera/) ? "talking head"
    : has(t, /\bpov\b|sketch|skit/) ? "POV sketch"
    : has(t, /demo|walkthrough|tutorial|how[- ]to/) ? "demo"
    : has(t, /promo|promotion|offer|ad\b/) ? "promo"
    : has(t, /workout|exercise/) ? "workout"
    : "";
  const base = { goal: "", topic: "", format, platform, audience: "", outcome: "", queries: [] as string[] };
  const kind: IntentKind =
    has(t, /\b(schedule|reschedule|space (them|out)|post (these|them)|move (my|the) posts?)\b/) ? "schedule"
    : linkIn(question) || has(t, /(recreate|copy|match|same) (this|the|that)?\s*(editing|edit|style|video|reel)|editing style|reference video/) ? "reference_style"
    : has(t, /\bwhy (did|has|have|is|are)\b.*\b(drop|fall|fell|decline|down|low|lower|change|grow|up)|\b(engagement|views|reach|followers)\b.*\b(drop|declin|fall|fell|down)|how (am i|is my account) doing/) ? "own_performance"
    : has(t, /\b(improve|fix|better)\b.*\b(my|this|latest|last)\b.*\b(reel|post|video)\b/) ? "improve_post"
    : has(t, /\b(next week|this week|weekly|content plan|calendar|what should i post)\b/) ? "plan_week"
    : has(t, /\b(hooks?|formats?|trends?|trending|what'?s working)\b.*\b(niche|industry|space|creators?|working)\b|\bresearch\b/) ? "niche_research"
    : has(t, /\b(script|film|pitch|write|make|create|idea|hook|caption|promo|promotional|reel|video|short)\b/) ? "create_content"
    : opts.page === "competitors" ? "competitor"
    : "general";
  const topicMatch = /(?:about|pitching|pitch|promote|promoting|for|on)\s+([^.?!,]{3,60})/i.exec(question);
  const topic = (topicMatch?.[1] ?? opts.niche ?? "").trim();
  const q = queryFrom(topic, format);
  const queries = (kind === "create_content" || kind === "niche_research" || kind === "plan_week") && q.length >= 3 ? [`${q} shorts`] : [];
  return { ...base, kind, topic, queries };
}

/** A model's intent, kept within bounds; anything unreadable falls back to the guess. */
export function sanitizeIntent(raw: unknown, fallback: ResearchIntent): ResearchIntent {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown, max = 80) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const kind = (INTENT_KINDS as readonly string[]).includes(r.kind as string) ? (r.kind as IntentKind) : fallback.kind;
  const queries = (Array.isArray(r.queries) ? r.queries : []).map((q) => s(q, 90)).filter((q) => q.length >= 3).slice(0, 2);
  return { kind, goal: s(r.goal), topic: s(r.topic), format: s(r.format, 40), platform: s(r.platform, 20).toLowerCase(), audience: s(r.audience), outcome: s(r.outcome), queries };
}

/** The intent as lines for the answering model. */
export function intentBlock(i: ResearchIntent, plan: SourcePlan): string {
  const f = (label: string, v: string) => (v ? `${label}: ${v}` : null);
  return [
    `# What the request is about (SOCIA's read of it)`,
    `Kind: ${i.kind.replace("_", " ")}`,
    f("Goal", i.goal), f("Topic", i.topic), f("Format", i.format), f("Platform", i.platform), f("Audience", i.audience), f("Outcome they want", i.outcome),
    `Evidence used: ${plan.why}`,
  ].filter(Boolean).join("\n");
}

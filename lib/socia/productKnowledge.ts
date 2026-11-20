// What SOCIA actually does, for Ask SOCIA (Noah, 2026-11-18: the assistant mixed up features and said
// "Discover finds trending audio", which no part of SOCIA does). Written from the code on 2026-11-18 and
// kept in step with it by lib/socia/productKnowledge.test.ts: every page named here must exist, and every
// plan named here must match lib/plans.ts FEATURE_MIN_PLAN. When a feature changes, change it here too.
//
// Pure and browser-safe.

import type { FeatureKey, PlanId } from "../plans";

export type ProductFeature = {
  /** The name the app shows. */
  name: string;
  /** The page, when it has one (checked to exist). */
  route: string | null;
  does: string;
  doesNot: string;
  /** The plan gate it sits behind (checked against FEATURE_MIN_PLAN), if any. */
  gate?: { key: FeatureKey; plan: PlanId };
};

export const FEATURES: ProductFeature[] = [
  { name: "Dashboard (Home)", route: "/dashboard", does: "What to do today and how each connected account is doing, from the account's own data; comments waiting; a competitor preview.", doesNot: "No sample numbers; no predictions." },
  { name: "Analytics", route: "/analytics", does: "Per-platform results: Overview, Content Performance (Top Content, Underperforming = below 70% of your median, By Format, Breakouts = 3x your median or more), Audience, Posting Times (Best Times to Post from your own past posts) and Growth.", doesNot: "It shows which posts did well or badly against your own median; it doesn't explain why, predict results or use industry-wide data.", gate: { key: "posting_time_analysis", plan: "starter" } },
  { name: "Reports", route: "/reports", does: "Performance summaries for this week, this month or 90 days, plus what SOCIA learned from experiments.", doesNot: "Not the niche news (that's the Weekly roundup)." },
  { name: "Weekly roundup", route: "/roundup", does: "Once a week: trending in your niche, competitor moves, your breakout posts, where you could win.", doesNot: "Takes no action; no audio.", gate: { key: "weekly_trend_roundup", plan: "starter" } },
  { name: "Discover", route: "/discover", does: "Your competitors with their numbers and video style; Reels to copy (competitors' and the niche's Reels that went viral, with a line on how to make your own version, Add to my plan and Copy brief); accounts you copy Reels from; suggested accounts and Find accounts like mine.", doesNot: "No trending audio, no hashtags; it never adds a competitor by itself; copying means the idea, not the video." },
  { name: "Content Plan (AI Content Plan)", route: "/plan", does: "SOCIA plans the week's posts for you: what to post each day, the hook, the format and why, built from your strategy, results and competitors. Each post links to a production guide and, for animated posts, Make the video.", doesNot: "It plans; it doesn't make the finished video or publish anything.", gate: { key: "content_plan", plan: "free" } },
  { name: "Strategy", route: "/plan/strategy", does: "The brand's growth strategy: objective, audience, content pillars, pace and experiments. The weekly plan is built from it.", doesNot: "Doesn't produce posts itself." },
  { name: "Calendar", route: "/plan/calendar", does: "Scheduled posts on a calendar with best days and times, results against your median, and approvals.", doesNot: "Ideas live in the Content Plan; the calendar holds posts." },
  { name: "Create post", route: "/create", does: "The composer: add media, write or generate the caption (Generate Caption), choose platforms, then publish now or schedule.", doesNot: "Members can't publish; they save drafts or submit for approval.", gate: { key: "scheduling", plan: "free" } },
  { name: "Content Studio: Rate (the Reel Rater)", route: "/studio", does: "You bring a finished video; SOCIA scores it out of 100 with a virality breakdown, compares it with your best posts and competitors' Reels, suggests improvements, a caption and audio direction.", doesNot: "Ratings are an estimate, never a guarantee of views." },
  { name: "Content Studio: Video editor", route: "/studio", does: "You add your clips; SOCIA edits them from a prompt or a reference video, or you edit by hand: captions, text, effects, logo, end card, voiceover, music from your own uploaded sounds. Make This Video builds the edit for you (Starter and up).", doesNot: "It doesn't film for you or generate footage; music comes only from sounds you uploaded; it doesn't list trending audio.", gate: { key: "build_from_clips", plan: "free" } },
  { name: "Production guide (Plan a post)", route: "/studio", does: "Opened from a planned post: hooks, structure, script, shot list, filming and editing notes, caption.", doesNot: "Comes before filming; it doesn't edit video." },
  { name: "Animated videos (Make the video)", route: null, does: "SOCIA writes the scenes of an animated video (words on screen, counters, comparisons), you check them, and your browser renders it and saves it as a draft. A setting adds animated posts to every plan.", doesNot: "No filming, no AI footage, never posts by itself. Starter and up (animated videos allowance)." },
  { name: "AI Clipper", route: "/clipper", does: "Turns a long video into captioned vertical clips; Live streams clips the moments a Twitch chat spikes.", doesNot: "Live clipping is Twitch only.", gate: { key: "ai_clipper", plan: "starter" } },
  { name: "AI Studio", route: "/ai-studio", does: "Generates new AI video or images from text or an image (models such as Kling and Wan), paid in credits.", doesNot: "Pro clips are up to 10 seconds; it's AI footage, not your own clips.", gate: { key: "ai_studio", plan: "pro" } },
  { name: "Ask SOCIA (with SIO)", route: null, does: "The assistant in every page: answers from your data, writes scripts, captions and hooks, proposes plan changes and schedules (nothing changes until you confirm), and saves footage you add as drafts. SIO is its face and asks your routine questions on the Dashboard.", doesNot: "Never changes anything without a click." },
  { name: "Comments (Inbox)", route: "/comments", does: "Drafts a reply to new Instagram and Facebook comments for you to approve; optional automatic replies to praise and to questions it can answer, every 30 minutes; complaints always wait for you.", doesNot: "No DMs, no YouTube or TikTok comments; it doesn't send links or anything privately.", gate: { key: "comment_replies", plan: "growth" } },
  { name: "Contacts", route: "/contacts", does: "People who commented or signed up on your page, with tags, notes and CSV export.", doesNot: "Doesn't send emails or messages.", gate: { key: "contacts", plan: "starter" } },
  { name: "Publishing", route: "/create", does: "Publishes and schedules Instagram (Reels, posts, carousels, Trial Reels) and YouTube; Facebook and TikTok for accounts already connected.", doesNot: "Facebook and TikTok can't be newly connected right now (offline for now); no Instagram Stories." },
  { name: "Team and approvals", route: "/settings", does: "Invite people by link; Members draft and submit; on Pro, the owner or Admins approve, which schedules the post.", doesNot: "Members can't publish.", gate: { key: "approval_workflow", plan: "pro" } },
  { name: "What you offer", route: "/settings", does: "In setup and Settings: SOCIA reads the brand's website (homepage and up to five pages) and lists what it offers (features, products, menu, services) and the facts it states, for the person to check; every script, caption, plan and comment reply names only what's listed.", doesNot: "Reads public websites only; keeps the list, not the pages." },
  { name: "Brand Workspaces", route: "/settings", does: "Separate brands, each with its own accounts, plan and settings; switch from the top bar.", doesNot: "One account per platform per brand." },
  { name: "AI Assistants", route: "/settings", does: "Connect Claude, ChatGPT or another MCP app to read your analytics, plan and posts, and (with its own switch, Starter and up) create posts.", doesNot: "No Telegram or other chat-app integration.", gate: { key: "ai_assistants", plan: "free" } },
  { name: "AI credits", route: "/settings", does: "One monthly balance pays for every AI action; it resets each month.", doesNot: "No top-ups yet." },
];

/**
 * Names people use that aren't the app's own. "AI Content Generation" isn't a page: it means the tools that
 * make content, never the Content Plan (Noah's correction in the failure conversation).
 */
export const ALIASES: { said: string; means: string }[] = [
  { said: "AI Content Plan", means: "the Content Plan: SOCIA plans the week's posts (what to post and why). It plans; it doesn't make the videos." },
  { said: "AI Content Generation", means: "the tools that make the content itself: animated videos (Make the video), the Video editor's Make This Video from your clips, AI Studio's AI footage, and captions, scripts and hooks from Ask SOCIA and Generate Caption. Never the Content Plan." },
  { said: "Reel Rater", means: "Content Studio's Rate tab." },
  { said: "Competitor Intelligence", means: "Discover's competitors and Reels to copy, plus the Weekly roundup's competitor moves." },
  { said: "AI Video Editor", means: "Content Studio's Video editor." },
];

/**
 * Things the assistant has said about SOCIA that aren't true, and how to catch them in an answer. A match
 * sends the answer back once to be fixed (app/api/ask/route.ts).
 */
export const FALSE_CLAIMS: { test: RegExp; detail: string }[] = [
  { test: /\b(?:SOCIA|Socia|it|Discover|the (?:app|editor|video editor|studio))\b[^.\n]{0,80}\b(?:finds?|lists?|shows?|gives?|picks?|suggests?|surfaces?)\b[^.\n]{0,40}\btrending (?:audio|sounds?|songs?|music)\b/i, detail: "SOCIA doesn't list or find trending audio anywhere (not Discover, not the editor)." },
  { test: /\bDiscover\b[^.\n]{0,80}\b(?:audio|sounds?|songs?|music|hashtags?)\b/i, detail: "Discover shows competitors, Reels to copy and suggested accounts; no audio or hashtags." },
  { test: /\b(?:SOCIA|Socia)\b[^.\n]{0,80}\bTelegram\b/i, detail: "SOCIA has no Telegram integration." },
  { test: /\b(?:Content Plan|AI Content Plan)\b[^.\n]{0,60}\b(?:makes?|edits?|renders?|films?|generates?) (?:the |your )?(?:videos?|reels?|footage)\b/i, detail: "The Content Plan plans posts; the videos are made in the Video editor, animated videos or AI Studio." },
  { test: /\bguarantee[sd]?\b[^.\n]{0,40}\b(?:views|viral|followers|growth|results|sales)\b|\b(?:will|100%) go viral\b/i, detail: "No result can be guaranteed; say what it helps with instead." },
];

/**
 * The false claims an answer makes, by detail. A sentence that denies it ("SOCIA doesn't list trending
 * audio", "never a guarantee of views") isn't the claim. Pure.
 */
export function falseClaimsIn(text: string): string[] {
  const out: string[] = [];
  for (const c of FALSE_CLAIMS) {
    const re = new RegExp(c.test.source, c.test.flags.includes("g") ? c.test.flags : `${c.test.flags}g`);
    for (const m of text.matchAll(re)) {
      // The words just before it in the same sentence count too: "never a guarantee of views".
      const lead = text.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0).split(/[.!?\n]/).pop() ?? "";
      if (/\b(?:not|never|no|nothing|none|without|doesn'?t|don'?t|isn'?t|can'?t|won'?t)\b|n't\b/i.test(`${lead}${m[0]}`)) continue;
      out.push(c.detail);
      break;
    }
  }
  return out;
}

/** The product block for the assistant's instructions: compact, one line per feature. */
export function productBlock(): string {
  return [
    "# SOCIA's real features (the only source for anything said about SOCIA itself)",
    "When an answer or a script describes SOCIA, its features or plans, use only this list, by these names. Never invent a feature, integration, plan or result, and never mix two features up.",
    ...FEATURES.map((f) => `- ${f.name}${f.route ? ` (${f.route})` : ""}: ${f.does} Not: ${f.doesNot}`),
    "Names people use:",
    ...ALIASES.map((a) => `- "${a.said}" means ${a.means}`),
  ].join("\n");
}

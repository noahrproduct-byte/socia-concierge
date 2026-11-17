// "What you get in SOCIA" on the strategy reveal (Noah, 2026-11-16: "list all
// of the features ... they should feel like it's worth buying"). Every entry
// is a real screen that works today, said in terms of this person's own
// strategy where there is a number to use, and marked with the plan it starts
// on (read from lib/plans.ts, never typed here), so nothing is promised that
// the plan chosen on the next step doesn't include. Pure and browser-safe.
import { FEATURE_MIN_PLAN, PLANS, PLAN_RANK, SALE_ORDER, type FeatureKey, type MeterKey, type PlanId } from "./plans";

export type Tool = { name: string; what: string; href: string; /** "Included on your plan" or "From Starter". */ from: string; included: boolean };
export type ToolGroup = { group: string; tools: Tool[] };

export type ToolsInput = {
  /** The plan the person is on now. */
  plan: PlanId;
  /** Posts a week in the strategy, when one was written. */
  posts: number | null;
  /** "5,000 followers", when a target was set. */
  target: string | null;
  /** Competitors the brand tracks. */
  competitors: number;
};

type Need = { feature: FeatureKey } | { meter: MeterKey } | "every plan";

/** The cheapest plan on sale that includes a feature, or gives any of a metered allowance. */
export function startsOn(need: Need): PlanId {
  if (need === "every plan") return SALE_ORDER[0];
  if ("feature" in need) return FEATURE_MIN_PLAN[need.feature];
  return SALE_ORDER.find((p) => (PLANS[p].meters[need.meter] ?? 0) > 0) ?? SALE_ORDER[SALE_ORDER.length - 1];
}

type Entry = { name: string; what: string; href: string; need: Need };

/** Every tool, grouped by the job it does, worded for this strategy. */
export function toolGroups(input: ToolsInput): ToolGroup[] {
  const n = input.posts && input.posts > 0 ? input.posts : null;
  const posts = n ? `your ${n} ${n === 1 ? "post" : "posts"}` : "your posts";
  const groups: { group: string; entries: Entry[] }[] = [
    {
      group: "Plan the week",
      entries: [
        { name: "Content Plan", href: "/plan", need: { meter: "content_plan" }, what: `Writes ${posts} for the week from your goal, your own results and your niche, each with a hook, a storyboard, filming directions and the reason behind it.` },
        { name: "Calendar", href: "/plan/calendar", need: { feature: "scheduling" }, what: "Schedules the week so posts go out when your audience is there, and publishes them for you." },
        { name: "Today", href: "/dashboard", need: { feature: "daily_recommendations" }, what: "One thing to do each day, from your plan and your latest numbers." },
      ],
    },
    {
      group: "Make the videos",
      entries: [
        { name: "Video editor", href: "/studio", need: { feature: "build_from_clips" }, what: "Cuts your clips into a finished vertical video on a timeline, with captions, text and transitions." },
        { name: "Make This Video", href: "/studio", need: { feature: "auto_build" }, what: "Hand over your raw clips and SOCIA cuts the first draft for you to edit." },
        { name: "Animated videos", href: "/plan", need: { meter: "animated_videos" }, what: "Makes videos for plan posts with no filming: words, counters and comparisons, animated in your own colours." },
        { name: "Voiceovers", href: "/plan", need: { meter: "voiceovers" }, what: "Writes and voices a narration for a video, with captions timed to each word." },
        { name: "AI Clipper", href: "/clipper", need: { feature: "ai_clipper" }, what: "Turns one long video into several short clips with captions." },
        { name: "Content Rater", href: "/studio", need: { meter: "content_studio" }, what: "Scores a video before you post it and says what to fix in the opening." },
        { name: "Caption writer", href: "/create", need: { meter: "content_generation" }, what: "Writes the caption and hashtags from what is in the video." },
      ],
    },
    {
      group: "Learn what works",
      entries: [
        { name: "Analytics", href: "/analytics", need: "every plan", what: input.target ? `Tracks your numbers against your target of ${input.target}.` : "Tracks your numbers against the goal you just set." },
        { name: "Discover", href: "/discover", need: "every plan", what: input.competitors > 0 ? `Watches your ${input.competitors} ${input.competitors === 1 ? "competitor" : "competitors"} and shows the Reels worth learning from.` : "Shows what is working for accounts like yours, with the Reels to learn from." },
        { name: "What's working", href: "/analytics", need: { feature: "deeper_insights" }, what: "Says what changed, what is working, what is missing and what to do next." },
        { name: "Best times to post", href: "/analytics", need: { feature: "posting_time_analysis" }, what: "Finds the days and hours your own posts have done best." },
        { name: "Weekly roundup", href: "/roundup", need: { feature: "weekly_trend_roundup" }, what: "A weekly read of your results and the trends in your niche." },
        { name: "Breakout alerts", href: "/dashboard", need: { feature: "breakout_alerts" }, what: "Tells you when a post takes off past your usual numbers." },
      ],
    },
    {
      group: "Grow the audience",
      entries: [
        { name: "Comment replies", href: "/comments", need: { feature: "comment_replies" }, what: "Drafts replies to your comments for you to approve and send." },
        { name: "Contacts", href: "/contacts", need: { feature: "contacts" }, what: "Keeps the people who comment, with tags and notes, and gives you a sign-up page." },
        { name: "Ask SOCIA", href: "/dashboard", need: { meter: "ask_socia" }, what: "Answers questions about your account, and schedules or moves posts when you ask." },
        { name: "Your own AI assistant", href: "/settings", need: { feature: "ai_assistants" }, what: "Connects Claude or ChatGPT so it can read your SOCIA numbers and plan." },
      ],
    },
  ];
  return groups.map((g) => ({
    group: g.group,
    tools: g.entries.map((e) => {
      const min = startsOn(e.need);
      const included = PLAN_RANK[input.plan] >= PLAN_RANK[min];
      return { name: e.name, what: e.what, href: e.href, included, from: included ? "Included on your plan" : `From ${PLANS[min].name}` };
    }),
  }));
}

/** How many tools there are, and how many the person's plan includes. */
export function toolCount(groups: ToolGroup[]): { all: number; included: number } {
  const tools = groups.flatMap((g) => g.tools);
  return { all: tools.length, included: tools.filter((t) => t.included).length };
}

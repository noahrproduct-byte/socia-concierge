"use client";

// The Planner on a made-up plan, for looking at its layout without an account.
// Development only (app/dev/plan-lab). Nothing here is real data.
import ContentPlanClient, { type PlanContext } from "@/components/ContentPlanClient";
import PlanRows from "@/components/dashboard/PlanRows";
import type { Deliverable } from "@/lib/schema";
import "@/app/(app)/dashboard/dashboard.css";
import "@/app/(app)/dashboard/dashboard-week.css";

const item = (day: string, title: string, hook: string, extra: Record<string, unknown> = {}) => ({
  day, title, hook, concept: "A client case study as a Reel, opened on one line and closed with one ask.", format: "Reel", rationale: "It serves the main goal.", evidence: "", predictedPerformance: "",
  platform: "Instagram", audience: "Local owners who think video is expensive", cta: "DM us the word REEL", successMetric: "Beat your usual post (166 interactions)",
  beats: [
    { label: "The hook", from: 0, to: 3, show: "You walk into frame toward the phone at chest height and stop.", say: hook },
    { label: "The proof", from: 3, to: 12, show: "Screen recording scrolling the pizza spot's Reels and their view counts.", say: "One pizza spot we film for. Over 2 million views." },
    { label: "What we did", from: 12, to: 22, show: "Quick cuts of the footage you already shot at the shop.", say: "We filmed it and edited it." },
    { label: "The ending", from: 22, to: 30, show: "Back to you in the same medium shot, static, with the ask on screen.", say: "DM us the word REEL." },
  ],
  ...extra,
});
const data = {
  clientHandle: "waslmediaco", niche: "Business", platform: "Instagram", headline: "", auditSummary: "", strengths: [], problems: [], topFixes: [], competitorInsights: [],
  weeklyPlan: [
    // A made-up example Reel (lab only) and what to copy from it; the second post has none, so its direction stands in.
    item("Tuesday", "Over 2 million views for one pizza spot", "Reels don't cost you money. Being invisible does.", {
      filmRef: { url: "https://www.instagram.com/reel/EXAMPLE/", platform: "instagram", account: "@studio.example", title: "Nobody films small shops right", views: 412000, likes: null, comments: null, multiplier: 9.4, basis: "views", structure: "Contrarian hook" },
      filmLike: "Phone at chest height, you walking toward it in one take, then a hard cut to the screen recording; same plain wall behind you and window light from the side.",
    }),
    item("Saturday", "Fifty days of silence", "He stayed silent for fifty days.", { made: { step: "filmed", at: new Date().toISOString() }, direction: "Close on your face, phone on a stack of books at eye level, one take; cut to the shop door opening for the ending." }),
  ],
} as unknown as Deliverable;
const context = {
  prefill: { clientHandle: "waslmediaco", niche: "Business", platform: "Instagram", brandVoice: "", recentPosts: "", competitors: "", goal: "" },
  autoNotes: {}, profile: { niche: "Business", goal: null, voice: null }, connected: true, username: "waslmediaco", syncedAgo: "2m ago", postsAnalyzed: 11, engRate: null,
  posts: [], evidence: { posts: 11, competitors: 0, winning: 0 }, strategy: null, mix: { onCamera: 2, animated: 0 }, animatedAllowed: false, competitors: [], canAddCompetitor: false, aboutConfirmed: true,
} as unknown as PlanContext;

export default function PlanLab() {
  return (
    <div className="s-page">
      <ContentPlanClient context={context} initial={{ data, id: null }} />
      <div className="dash-stack">
        <PlanRows planId="lab" items={data.weeklyPlan} rows={[
          { index: 0, title: "Over 2 million views for one pizza spot", day: "Tuesday", stage: 1, animated: false },
          { index: 1, title: "Fifty days of silence", day: "Saturday", stage: 2, animated: false },
        ]} />
      </div>
    </div>
  );
}

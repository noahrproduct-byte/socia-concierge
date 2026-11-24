"use client";

// The plan built one day at a time on a made-up plan, for looking at its layout without an account or the AI.
// Development only (app/dev/step-lab). Its steps answer from this page: nothing here is real data.
import { useEffect, useState } from "react";
import StepPlan from "@/components/plan/StepPlan";
import { planSlots, newBuild, withIdea, acceptDay, finishDay, beginRetry, editDay, pickEarlier } from "@/lib/planSteps";
import type { Deliverable, IdeaCard } from "@/lib/schema";

const PLAN = "00000000-0000-4000-8000-0000000000aa";
const input = { clientHandle: "salvospizza", niche: "Pizza restaurant", platform: "Instagram", brandVoice: "", recentPosts: "", competitors: "", goal: "", onCamera: 3, animated: 1 };
const ideas: IdeaCard[] = [
  { title: "The 6 AM dough nobody sees", pillar: "Behind the scenes", description: "You stretching the day's dough before opening, then the first pie going into the oven.", format: "Reel, filmed footage", fromIdea: 1 },
  { title: "Slices sold on a Saturday", pillar: "Proof", description: "A counter that climbs through one Saturday, from the first slice to closing.", format: "Animated video", template: "counter", hook: "One oven, one Saturday" },
  { title: "Three pies, three regulars", pillar: "Community", description: "Three regulars each order their usual and say why in one line.", format: "Reel, talking to camera" },
  { title: "What a cheese pull takes", pillar: "Craft", description: "Close on the cheese, the oven door and the cut, in one take.", format: "Reel, filmed footage" },
];

function start(): Deliverable {
  let b = newBuild(input, planSlots({ onCamera: 3, animated: 1 }), new Date());
  b = withIdea(b, 0, ideas[0]);
  b = finishDay(acceptDay(b, 0), 0, { itemId: "lab-item-0001" });
  b = withIdea(b, 1, ideas[1]);
  return { clientHandle: input.clientHandle, niche: input.niche, platform: input.platform, headline: "", auditSummary: "", strengths: [], problems: [], topFixes: [], competitorInsights: [], weeklyPlan: [], build: b };
}

export default function StepLab() {
  const [data, setData] = useState<Deliverable>(start);
  useEffect(() => {
    // The steps answer here, after a short wait, as the server would.
    const real = window.fetch.bind(window);
    let n = 2;
    window.fetch = async (url, init) => {
      if (!String(url).includes("/api/plan/steps")) return real(url, init);
      await new Promise((r) => setTimeout(r, 600));
      let next = data;
      setData((d) => { next = d; return d; });
      const b = next.build!;
      const body = init?.body ? JSON.parse(String(init.body)) : { action: "get" };
      let nb = b;
      if (body.action === "accept") {
        nb = acceptDay(b, body.day, body.idea);
        const w = nb.slots.findIndex((s) => s.state === "waiting");
        if (w >= 0) nb = withIdea(nb, w, ideas[Math.min(n++, ideas.length - 1)]);
      } else if (body.action === "retry") nb = withIdea(beginRetry(b, body.day), body.day, { ...ideas[3], title: `Another idea ${b.slots[body.day].tries + 1}` });
      else if (body.action === "edit") nb = editDay(b, body.day, body.idea);
      else if (body.action === "earlier") nb = pickEarlier(b, body.day, body.earlier);
      else nb = { ...b, slots: b.slots.map((s) => (s.state === "writing" ? { ...s, state: "done" as const, itemId: "lab" } : s)) };
      return new Response(JSON.stringify({ plan: { id: PLAN, data: { ...next, build: nb } } }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    return () => { window.fetch = real; };
  }, [data]);
  return (
    <div className="s-page">
      <StepPlan planId={PLAN} data={data} onChange={setData} />
    </div>
  );
}

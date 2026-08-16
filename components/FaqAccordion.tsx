"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";

const FAQS = [
  {
    q: "How does the free audit work?",
    a: "Connect an account and SOCIA analyzes your recent posts, engagement patterns, and niche in under 60 seconds — then returns a 0–100 health score with your top-3 fixes. No credit card required.",
  },
  {
    q: "Which platforms are supported?",
    a: "Instagram, TikTok, YouTube Shorts, LinkedIn, and X. The recommendation engine and scheduler tailor formats and timing to each platform.",
  },
  {
    q: "Does the video scorer actually predict performance?",
    a: "It scores hook, script, visual, and audio, then models a predicted retention curve. On Pro, creators see a 92% score-to-hit rate on posts scoring above 80.",
  },
  {
    q: "Can my team collaborate?",
    a: "Studio and Agency plans include shared workspaces, roles, and approval flows so drafts move from creator to reviewer to scheduled without leaving SOCIA.",
  },
  {
    q: "Is my data safe?",
    a: "Yes. We use read-only access where possible, encrypt data in transit and at rest, and never sell your data. You can disconnect an account at any time.",
  },
];

export default function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="lp-faq">
      {FAQS.map((f, i) => (
        <div className={`lp-faq-item${open === i ? " open" : ""}`} key={i}>
          <button className="lp-faq-q" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            {f.q}
            {open === i ? <Minus size={18} /> : <Plus size={18} />}
          </button>
          {open === i && <p className="lp-faq-a">{f.a}</p>}
        </div>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";

const FAQS = [
  {
    q: "How does the free audit work?",
    a: "Connect an account and SOCIA analyzes your recent posts, engagement patterns, and niche in under 60 seconds — then returns a 0–100 health score with your top-3 fixes. No credit card required.",
  },
  {
    q: "Can I use SOCIA for multiple social media platforms?",
    a: "Yes. Instagram, TikTok, YouTube Shorts, LinkedIn, and X are supported. The recommendation engine and scheduler tailor formats and timing to each platform.",
  },
  {
    q: "Will SOCIA create content for me?",
    a: "SOCIA generates hooks, captions, and post concepts, and scores your videos before you post. On higher tiers it also generates graphics and ad creative from your brand kit.",
  },
  {
    q: "What if I don't see results?",
    a: "Start free and upgrade only when the loop pays for itself. Every plan is month-to-month — cancel anytime, no lock-in.",
  },
];

export default function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="nl-faq">
      {FAQS.map((f, i) => (
        <div className={`nl-faq-item${open === i ? " open" : ""}`} key={i}>
          <button className="nl-faq-q" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            {f.q}
            {open === i ? <Minus size={18} /> : <Plus size={18} />}
          </button>
          {open === i && <p className="nl-faq-a">{f.a}</p>}
        </div>
      ))}
    </div>
  );
}

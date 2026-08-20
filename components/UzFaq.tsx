"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

const FAQS = [
  {
    q: "What does SOCIA actually do?",
    a: "You connect your account, and SOCIA reads it: your niche, your posts, what performs. Then it hands you a daily plan with content ideas already scored, so you know what will land before you post it.",
  },
  {
    q: "Which platforms can I connect?",
    a: "Instagram connects live today with real profile and post data. TikTok and YouTube register now and sync as each platform approves API access.",
  },
  {
    q: "How is this different from a scheduling tool?",
    a: "Schedulers help you publish. SOCIA decides what is worth publishing. It scores your hooks, finds your best posting windows, and watches your competitors, then the plan writes itself around that.",
  },
  {
    q: "Do I need a big account for this to work?",
    a: "No. The strategy engine works from your first post. Small accounts often see the fastest gains because the plan removes the guessing.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. Every paid plan starts with 7 days free, full access, cancel anytime before it ends.",
  },
];

export default function UzFaq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="uz-faq">
      {FAQS.map((f, i) => (
        <div key={i} className={`uz-faq-item ${open === i ? "open" : ""}`}>
          <button className="uz-faq-q" onClick={() => setOpen(open === i ? null : i)}>
            <span>{f.q}</span>
            <Plus size={18} className="uz-faq-plus" />
          </button>
          <div className="uz-faq-a">
            <p>{f.a}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

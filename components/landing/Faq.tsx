"use client";

import { useState } from "react";

// The live site's questions, with the answers brought up to date with what
// the product does now (every platform connects; Studio renders in the
// browser). A list with disclosure, one open at a time.

const FAQS = [
  { q: "How does the free start work?", a: "You connect an account and SOCIA reads it: your posts, your engagement, your niche. You get an account health score, content opportunities, a performance breakdown, and top recommendations, from your own numbers." },
  { q: "What platforms does SOCIA support?", a: "Instagram, Facebook, YouTube and TikTok connect with real profile and post data. SOCIA publishes to Instagram, Facebook and YouTube; TikTok videos arrive in your TikTok inbox as drafts until TikTok approves direct posting." },
  { q: "Does SOCIA create content?", a: "It plans and drafts: weekly strategies, post concepts, hooks, scripts and captions. Content Studio turns the clips you upload into a suggested cut you render in your browser. You stay the voice." },
  { q: "Can SOCIA predict whether content will perform?", a: "It scores every idea on hook, retention, relevance, and originality against what your audience already responds to. A score is a forecast, not a promise, and SOCIA says how many posts it rests on." },
  { q: "Does SOCIA replace a social media manager?", a: "For solo creators, it covers the strategy work a manager would do. For teams and agencies, it makes the manager faster: audits, plans, and scoring in minutes instead of afternoons, with approvals for the team." },
  { q: "How does SOCIA use my data?", a: "Your synced account data builds your dashboard and your plans. It stays yours, it isn't sold, and disconnecting an account deletes its history." },
  { q: "Can I cancel anytime?", a: "Yes. No lock-in. Change or cancel your plan whenever you want; a downgrade takes effect at the end of the period you've paid for." },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="lp-faq">
      <p className="lp-label">Questions we&apos;re asked</p>
      <ol className="lp-index">
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <li key={f.q}>
              <button type="button" className="lp-index-row is-faq" aria-expanded={isOpen} aria-controls={`faq-${i}`} onClick={() => setOpen(isOpen ? null : i)}>
                <h3>{f.q}</h3>
                <span className="lp-index-toggle" aria-hidden="true">{isOpen ? "−" : "+"}</span>
              </button>
              <div className="lp-index-panel" data-open={isOpen} id={`faq-${i}`} aria-hidden={!isOpen}>
                <div><p className="lp-faq-a">{f.a}</p></div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import BrandMark from "@/components/BrandMark";
import { gsap, EASE, reduced } from "./motion";

// Chapter 6: Ask SOCIA. Three questions a person might ask; each answer is
// reasoned from the example account's data, and the reasoning is shown in
// order: the question takes, the evidence appears, a gold line runs from the
// evidence to the recommendation, the recommendation lands. Illustrative,
// and labelled.

const QA = [
  {
    q: "What should I post this week?",
    why: [["Hook demand", "Strong for practical, talking-to-camera"], ["Audience interest", "Rising on educational posts"], ["Posting window", "Thursday 6:20 to 7:00pm"], ["Competitor saturation", "Low this week"]],
    a: "Your audience is responding strongest to educational short-form content. Publish a 20 to 30 second Reel on Thursday between 6:20 and 7:00pm.",
    concept: "3 content mistakes quietly killing your reach.",
  },
  {
    q: "Why did my last Reel perform better?",
    why: [["Timing", "Thursday 6:40pm, your strongest window"], ["First 2 seconds", "A question, on screen"], ["Format fit", "Educational, captions on"], ["Length", "24 seconds, 64% watched to the end"]],
    a: "It went out in your strongest window and opened with a question on screen. Your Reels that open with a question are watched to the end 1.6x as often.",
    concept: "Open the next one with the question your customers ask most.",
  },
  {
    q: "What are my competitors doing differently?",
    why: [["Format gap", "Educational Reels, weekly"], ["Their momentum", "+31% this month"], ["Your last one", "19 days ago"], ["Saturation", "Low: two accounts, not twenty"]],
    a: "Two of the three accounts you follow posted educational Reels this week and both beat their median. You haven't posted one in 19 days.",
    concept: "An educational Reel on your most-asked customer question.",
  },
];

export default function Strategist() {
  const root = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const cur = QA[i];

  // the answer's sequence, each time the question changes
  useEffect(() => {
    const el = root.current;
    if (!el || reduced()) return;
    const rows = el.querySelectorAll(".lp-chat-why li");
    const line = el.querySelector(".lp-chat-line");
    const text = el.querySelector(".lp-chat-text");
    const concept = el.querySelector(".lp-chat-concept");
    const tl = gsap.timeline({ defaults: { ease: EASE } });
    tl.fromTo(rows, { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.09 }, 0)
      .fromTo(line, { scaleY: 0 }, { scaleY: 1, duration: 0.5, transformOrigin: "top center" }, 0.35)
      .fromTo(text, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 }, 0.6)
      .fromTo(concept, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 }, 0.8);
    return () => { tl.kill(); };
  }, [i]);

  return (
    <div ref={root} className="lp-screen" data-theme="light">
      <div className="lp-screen-top">
        <BrandMark size={18} />
        <b>Ask SOCIA</b>
        <span>Reasoning from your Instagram data</span>
        <em className="lp-example">Example data</em>
      </div>
      <div className="lp-screen-body lp-chat">
        <div className="lp-chat-qs" role="tablist" aria-label="Example questions">
          {QA.map((x, k) => (
            <button key={k} type="button" role="tab" aria-selected={i === k} className="lp-chat-q" onClick={() => setI(k)}>{x.q}</button>
          ))}
        </div>
        <div className="lp-chat-a" role="tabpanel" aria-live="polite">
          <div className="lp-chat-evidence">
            <p className="lp-panel-label">What SOCIA looked at</p>
            <ul className="lp-chat-why" key={i}>
              {cur.why.map(([k, v]) => <li key={k}><span>{k}</span><b>{v}</b></li>)}
            </ul>
          </div>
          <span className="lp-chat-line" aria-hidden="true" />
          <div className="lp-chat-answer">
            <p className="lp-panel-label">SOCIA</p>
            <p className="lp-chat-text">{cur.a}</p>
            <p className="lp-chat-concept"><span>Suggested concept</span><b>{cur.concept}</b></p>
            <p className="lp-panel-foot">Sources: your posts, your audience, the competitors you follow, your historical performance.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

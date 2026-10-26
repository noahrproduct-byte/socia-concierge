"use client";

import { useState } from "react";
import BrandMark from "@/components/BrandMark";

// Chapter 4: Ask SOCIA. The live site's strategist exchange, interactive:
// three questions a person might ask, each answered from the example
// account's data with the reasoning shown. Illustrative, and labelled.

const QA = [
  {
    q: "What should I post Thursday?",
    a: "Your audience is responding strongest to educational short-form content this week. Publish a 20 to 30 second Reel between 6:20 and 7:00pm.",
    concept: "3 content mistakes quietly killing your reach.",
    why: [["Hook demand", "Strong"], ["Audience interest", "Rising"], ["Posting window", "Optimal"], ["Competitor saturation", "Low"]],
  },
  {
    q: "Why did last week's carousel underperform?",
    a: "It went out Saturday at 2pm, your weakest window, and its first slide had no hook. Your carousels with a question on slide one are saved twice as often.",
    concept: "Re-post it Thursday with a question on the first slide.",
    why: [["Timing", "Weak window"], ["First slide", "No hook"], ["Format fit", "Good"], ["Topic", "Rising"]],
  },
  {
    q: "What are my competitors doing that I'm not?",
    a: "Two of the three accounts you follow posted educational Reels this week and both outperformed their median. You haven't posted one in 19 days.",
    concept: "An educational Reel on your most-asked customer question.",
    why: [["Format gap", "Educational Reels"], ["Their momentum", "+31%"], ["Your last one", "19 days ago"], ["Saturation", "Low"]],
  },
];

export default function Strategist() {
  const [i, setI] = useState(0);
  const cur = QA[i];
  return (
    <div className="lp-screen" data-theme="light">
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
          <p className="lp-panel-label">SOCIA</p>
          <p className="lp-chat-text">{cur.a}</p>
          <p className="lp-chat-concept"><span>Suggested concept</span><b>{cur.concept}</b></p>
          <ul className="lp-rows is-inline" aria-label="Why this should work">
            {cur.why.map(([k, v]) => <li key={k}><span>{k}</span><b>{v}</b></li>)}
          </ul>
          <p className="lp-panel-foot">Sources: your posts, your audience, the competitors you follow, your historical performance.</p>
        </div>
      </div>
    </div>
  );
}

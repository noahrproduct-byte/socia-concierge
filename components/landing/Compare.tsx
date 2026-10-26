"use client";

import { useId, useState } from "react";
import BrandMark from "@/components/BrandMark";

// Chapter 8: before and after, as one frame you wipe across. Left, the
// five places the same signals live without SOCIA; right, one SOCIA
// workspace. A range input drives the wipe, so it works by touch, by mouse
// and by keyboard with no extra code. Illustrative, and labelled.

const WITHOUT = [
  { app: "Analytics", rows: [["Views, 30 days", "50.1K"], ["Reach", "22.5K"], ["Interactions", "2,270"]] },
  { app: "Notes", rows: [["Idea", "The autumn menu, start to finish"], ["Idea", "Behind the counter at 7am"]] },
  { app: "Calendar", rows: [["Thu", "Post something"], ["Sat", "Carousel?"]] },
  { app: "Competitor research", rows: [["Bakery across town", "Posted 4x this week"], ["Roastery downtown", "Reels again"]] },
  { app: "Captions", rows: [["Draft 3", "#latte #cafe #morning"], ["Draft 4", "Four new plates..."]] },
];

const WITH = [
  ["Account health", "Strong, 92, +12 vs last week"],
  ["This week's plan", "Tue Reel, Thu Reel, Sat carousel, in your windows"],
  ["Next move", "Another educational Reel, Thursday 6:40pm"],
  ["Competitors", "Bakery across town, +31% momentum: educational Reels"],
  ["Content Studio", "5 clips, suggested cut 14s, caption drafted"],
  ["Score before posting", "Hook 91, retention 78, overall 84"],
];

export default function Compare() {
  const [v, setV] = useState(50);
  const id = useId();
  return (
    <div className="lp-cmp" style={{ "--cut": `${v}%` } as React.CSSProperties}>
      <div className="lp-cmp-frame" aria-hidden="true">
        <div className="lp-cmp-side lp-cmp-without" data-theme="light">
          <p className="lp-cmp-cap">Without SOCIA</p>
          <ul className="lp-cmp-apps">
            {WITHOUT.map((a) => (
              <li key={a.app}>
                <b>{a.app}</b>
                <ul>{a.rows.map(([k, val]) => <li key={k + val}><span>{k}</span><span>{val}</span></li>)}</ul>
              </li>
            ))}
          </ul>
        </div>
        <div className="lp-cmp-side lp-cmp-with" data-theme="light">
          <p className="lp-cmp-cap is-gold">With SOCIA</p>
          <div className="lp-cmp-screen">
            <div className="lp-screen-top"><BrandMark size={18} /><b>SOCIA</b><span>One workspace</span><em className="lp-example">Example data</em></div>
            <ul className="lp-cmp-rows">{WITH.map(([k, val]) => <li key={k}><span>{k}</span><b>{val}</b></li>)}</ul>
          </div>
        </div>
        <span className="lp-cmp-handle"><span /></span>
      </div>
      <label className="lp-cmp-control" htmlFor={id}>
        <span>Drag to compare: without SOCIA on the left, with SOCIA on the right</span>
        <input id={id} type="range" min={0} max={100} value={v} onChange={(e) => setV(Number(e.target.value))} aria-valuetext={`${v}% with SOCIA`} />
      </label>
    </div>
  );
}

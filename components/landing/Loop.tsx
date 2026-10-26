"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { gsap, EASE, reduced } from "./motion";

// Chapter 7: the SOCIA loop as a timeline you move through, one stage large
// at a time, with what the product shows at that stage beside it. Click a
// stage, use the arrows, or the keyboard; the last stage points back to the
// first, which is the point. Illustrative, and labelled.

const STAGES = [
  { name: "Audit", line: "See what's working now.", panel: "health" },
  { name: "Plan", line: "Build your next strategy.", panel: "plan" },
  { name: "Create", line: "Create content that connects.", panel: "create" },
  { name: "Score", line: "Predict before you post.", panel: "score" },
  { name: "Publish", line: "Post at the right moment.", panel: "publish" },
  { name: "Measure", line: "See what actually worked.", panel: "measure" },
  { name: "Learn", line: "Turn results into intelligence.", panel: "learn" },
] as const;

function Panel({ kind }: { kind: (typeof STAGES)[number]["panel"] }) {
  switch (kind) {
    case "health":
      return (<ul className="lp-lp-rows"><li><span>Account health</span><b>Strong, 92</b></li><li><span>Hook strength</span><b>91</b></li><li><span>Posting consistency</span><b>84</b></li><li><span>Topic concentration</span><b>76</b></li></ul>);
    case "plan":
      return (<ul className="lp-lp-rows"><li><span>Tue 6:20pm</span><b>Educational Reel</b></li><li><span>Thu 6:40pm</span><b>Behind the counter, Reel</b></li><li><span>Sat 11:15am</span><b>Carousel: the autumn menu</b></li><li><span>Why</span><b>Your three strongest windows</b></li></ul>);
    case "create":
      return (<ul className="lp-lp-rows"><li><span>Hook</span><b>&quot;The mistake most cafes make at 8am&quot;</b></li><li><span>Script</span><b>24 seconds, three beats</b></li><li><span>Caption</span><b>Drafted from the clips</b></li><li><span>Studio</span><b>5 clips, suggested cut 14s</b></li></ul>);
    case "score":
      return (<ul className="lp-lp-rows"><li><span>Hook</span><b>91</b></li><li><span>Retention</span><b>78</b></li><li><span>Clarity</span><b>86</b></li><li><span>Overall</span><b>84. A forecast, not a promise</b></li></ul>);
    case "publish":
      return (<ul className="lp-lp-rows"><li><span>Scheduled</span><b>Thursday 6:40pm</b></li><li><span>Platforms</span><b>Instagram, Facebook, YouTube</b></li><li><span>Approval</span><b>Approved by the owner</b></li><li><span>Status</span><b>Queued</b></li></ul>);
    case "measure":
      return (<ul className="lp-lp-rows"><li><span>Views, 48h</span><b>12.4K, 2.4x average</b></li><li><span>Saves</span><b>418, 3.1x</b></li><li><span>Watched to the end</span><b>64%</b></li><li><span>Sample</span><b>14 posts, small</b></li></ul>);
    case "learn":
      return (<ul className="lp-lp-rows"><li><span>Pattern</span><b>Educational posts: 5 of your top 6</b></li><li><span>Updated</span><b>Thursday window confirmed</b></li><li><span>Next plan</span><b>Another educational Reel, Thursday</b></li><li><span>Then</span><b>Back to Audit</b></li></ul>);
  }
}

export default function Loop() {
  const root = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const cur = STAGES[i];
  const go = (n: number) => setI(((n % STAGES.length) + STAGES.length) % STAGES.length);

  useEffect(() => {
    const el = root.current;
    if (!el || reduced()) return;
    const big = el.querySelector(".lp-lp-big");
    const panel = el.querySelector(".lp-lp-panel");
    const tl = gsap.timeline({ defaults: { ease: EASE } });
    tl.fromTo(big, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6 }, 0)
      .fromTo(panel, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6 }, 0.1);
    return () => { tl.kill(); };
  }, [i]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
    if (e.key === "Home") { e.preventDefault(); go(0); }
    if (e.key === "End") { e.preventDefault(); go(STAGES.length - 1); }
  };

  return (
    <div ref={root} className="lp-lp" onKeyDown={onKey}>
      <ol className="lp-lp-stages" role="tablist" aria-label="The seven stages">
        {STAGES.map((s, k) => (
          <li key={s.name}>
            <button type="button" role="tab" aria-selected={i === k} tabIndex={i === k ? 0 : -1} className="lp-lp-stage" onClick={() => setI(k)}>
              <span className="lp-lp-n">{String(k + 1).padStart(2, "0")}</span>
              <span>{s.name}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="lp-lp-track" aria-hidden="true"><span style={{ width: `${((i + 1) / STAGES.length) * 100}%` }} /></div>

      <div className="lp-lp-body" role="tabpanel">
        <div className="lp-lp-big" key={`b${i}`}>
          <p className="lp-label">{String(i + 1).padStart(2, "0")} of 07</p>
          <h3>{cur.name}</h3>
          <p>{cur.line}</p>
          <div className="lp-lp-nav">
            <button type="button" className="lp-btn is-sm" onClick={() => go(i - 1)} aria-label="Previous stage">Previous</button>
            <button type="button" className="lp-btn is-sm is-filled" onClick={() => go(i + 1)} aria-label={i === STAGES.length - 1 ? "Back to the first stage" : "Next stage"}>{i === STAGES.length - 1 ? "Back to Audit" : "Next"}</button>
          </div>
        </div>
        <div className="lp-lp-panel" key={`p${i}`} data-theme="light">
          <p className="lp-panel-label">What SOCIA shows here <em className="lp-example">Example data</em></p>
          <Panel kind={cur.panel} />
        </div>
      </div>
    </div>
  );
}

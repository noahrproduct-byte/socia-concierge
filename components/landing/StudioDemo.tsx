"use client";

import { useState } from "react";
import BrandMark from "@/components/BrandMark";

// Chapter 4's interactive screen: Content Studio. The person picks which
// clips make the cut, and the cut, the running time and the caption follow.
// It is a model of what the real Studio does with uploaded clips; every
// figure is example data and the frame says so.

type Clip = { id: string; name: string; seconds: number; line: string };

const CLIPS: Clip[] = [
  { id: "pour", name: "Pouring", seconds: 14, line: "Four new plates, one first bite." },
  { id: "plate", name: "Plating", seconds: 22, line: "The autumn menu, start to finish." },
  { id: "wide", name: "Counter, wide", seconds: 41, line: "Open from Thursday." },
  { id: "bite", name: "First bite", seconds: 9, line: "One first bite." },
  { id: "board", name: "Menu board", seconds: 18, line: "Four new plates." },
];

const DEFAULT = new Set(["pour", "plate", "bite"]);

export default function StudioDemo() {
  const [picked, setPicked] = useState<Set<string>>(DEFAULT);
  const inCut = CLIPS.filter((c) => picked.has(c.id));
  const total = inCut.reduce((s, c) => s + Math.min(c.seconds, 12), 0);
  const caption = inCut.length ? `${inCut.map((c) => c.line).join(" ")} In store from Thursday.` : "Pick at least one clip.";

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  return (
    <div className="lp-screen" data-theme="light">
      <div className="lp-screen-top">
        <BrandMark size={18} />
        <b>Content Studio</b>
        <span>Seasonal menu shoot</span>
        <em className="lp-example">Example data</em>
      </div>
      <div className="lp-screen-body lp-studio">
        <ul className="lp-clips" aria-label="Uploaded clips: choose which make the cut">
          {CLIPS.map((c) => (
            <li key={c.id}>
              <button type="button" className="lp-clip" aria-pressed={picked.has(c.id)} onClick={() => toggle(c.id)}>
                <span>{c.name}</span>
                <span>0:{String(c.seconds).padStart(2, "0")}</span>
              </button>
            </li>
          ))}
        </ul>
        <div>
          <div className="lp-studio-meta">
            <span>Suggested cut</span>
            <span aria-live="polite">{inCut.length} of {CLIPS.length} clips, {total} seconds</span>
          </div>
          <div className="lp-cut" aria-hidden="true">
            {CLIPS.map((c) => (
              <span key={c.id} className={picked.has(c.id) ? undefined : "is-off"} style={{ flexGrow: picked.has(c.id) ? Math.min(c.seconds, 12) : 1.2 }}>
                {picked.has(c.id) ? c.name : ""}
              </span>
            ))}
          </div>
          <div className="lp-studio-meta"><span>Caption draft</span><span>From what the clips show and say</span></div>
          <p className="lp-draft" aria-live="polite">{caption}</p>
        </div>
      </div>
    </div>
  );
}

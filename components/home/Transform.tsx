"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import { PlatformMark } from "@/components/system/PlatformMark";
import "./transform.css";

// "Less switching. More creating.": the before-and-after, as one picture that
// changes when the visitor switches. Without SOCIA, six separate tools sit
// scattered and out of line: a spreadsheet kept by hand, a row of competitor
// tabs, a notes list, raw footage, a guess, and one upload screen per
// platform. With SOCIA, the same six move into one workspace and turn into
// SOCIA's own screens, joined in the order the work happens. Every number is
// an example and the stage says so. Motion only answers the switch; reduced
// motion swaps without moving.

/** left, top, width, height in % of the stage, and a tilt in degrees. */
type Box = [number, number, number, number, number?];

type Panel = {
  key: string;
  label: string;
  /** desktop: scattered, then in place */
  before: Box;
  after: Box;
  /** phone: the same idea on a tall stage */
  mBefore: Box;
  mAfter: Box;
  without: ReactNode;
  with: ReactNode;
};

const bars = [38, 52, 44, 61, 48, 70, 57, 82];

const PANELS: Panel[] = [
  {
    key: "numbers",
    label: "Analytics",
    before: [2, 6, 30, 34, -3],
    after: [3, 13, 30, 40],
    mBefore: [3, 2, 60, 15, -3],
    mAfter: [4, 7, 44, 27],
    without: (
      <div className="tf-sheet">
        <small>Spreadsheet, copied by hand</small>
        <table>
          <tbody>
            {[["Post", "Views", "Likes"], ["Mon reel", "1,204", "88"], ["Wed photo", "?", "41"], ["Fri reel", "3,980", "?"], ["Sun carousel", "", ""]].map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
    with: (
      <div className="tf-chart">
        <small>Views by day, last 30 days</small>
        <span className="tf-bars">
          {bars.map((h, i) => (
            <i key={i} style={{ height: `${h}%`, "--i": i } as CSSProperties} className={i === bars.length - 1 ? "is-top" : ""} />
          ))}
          <em className="tf-median" aria-hidden />
        </span>
        <b>Evening Reels beat your median 3 times in 4</b>
      </div>
    ),
  },
  {
    key: "rivals",
    label: "Competitors",
    before: [36, 2, 28, 22, 4],
    after: [35, 13, 30, 40],
    mBefore: [30, 17, 66, 12, 3],
    mAfter: [52, 7, 44, 27],
    without: (
      <div className="tf-tabs">
        <span className="tf-tabstrip">
          {["@theo.shoots", "@filmwithmaya", "@thecreatordesk", "@fitfoods", "+8"].map((t) => (
            <i key={t}>{t}</i>
          ))}
        </span>
        <small>12 tabs, checked one by one</small>
      </div>
    ),
    with: (
      <div className="tf-rivals">
        <small>Competitors, last 30 days</small>
        {[
          ["@filmwithmaya", "3.1× her median", true, "maya"],
          ["@theo.shoots", "2.2× his median", true, "theo"],
          ["@thecreatordesk", "0.8× their median", false, "creator-desk"],
        ].map(([n, v, up, av]) => (
          <span key={n as string} className="tf-rival">
            <Image className="tf-avatar" src={`/landing/avatars/${av}.jpg`} alt="" width={48} height={48} sizes="24px" />
            <b>{n}</b>
            <em className={up ? "is-up" : ""}>{v}</em>
          </span>
        ))}
      </div>
    ),
  },
  {
    key: "ideas",
    label: "Plan",
    before: [69, 9, 28, 38, 3],
    after: [67, 13, 30, 40],
    mBefore: [6, 31, 58, 17, -2],
    mAfter: [4, 36, 44, 27],
    without: (
      <div className="tf-notes">
        <small>Notes</small>
        <ul>
          <li>reel idea?? the lighting thing</li>
          <li>post more (how much?)</li>
          <li>copy what @filmwithmaya did</li>
          <li>tuesday maybe</li>
        </ul>
      </div>
    ),
    with: (
      <div className="tf-plan">
        <small>This week&apos;s plan</small>
        {[
          ["Mon", "Light a video with one lamp", "Reel, 6:30 PM"],
          ["Wed", "My desk setup, honestly", "Carousel, 12 PM"],
          ["Fri", "Your first mic: what to buy", "Reel, 6:30 PM"],
        ].map(([d, t, w]) => (
          <span key={d} className="tf-planrow">
            <i>{d}</i>
            <b>{t}</b>
            <em>{w}</em>
          </span>
        ))}
      </div>
    ),
  },
  {
    key: "footage",
    label: "Edit",
    before: [6, 50, 24, 46, 4],
    after: [3, 57, 30, 38],
    mBefore: [36, 47, 58, 19, 3],
    mAfter: [52, 36, 44, 27],
    without: (
      <div className="tf-raw">
        <Image src="/landing/creators/talking-camera.jpg" alt="" fill sizes="240px" />
        <span className="tf-rawmeta">
          <b>IMG_4821.MOV</b>
          <em>3:42 of raw footage</em>
        </span>
      </div>
    ),
    with: (
      <div className="tf-edit">
        <span className="tf-reel">
          <Image src="/landing/creators/talking-camera.jpg" alt="" fill sizes="120px" />
          <i className="tf-cap">one lamp, 45°</i>
        </span>
        <span className="tf-cut">
          <small>First cut, 0:14</small>
          <span className="tf-lane">
            <i style={{ left: "0%", width: "31%" }} />
            <i style={{ left: "33%", width: "36%" }} />
            <i style={{ left: "71%", width: "29%" }} />
          </span>
          <span className="tf-lane is-text">
            <i style={{ left: "4%", width: "24%" }} />
            <i style={{ left: "38%", width: "26%" }} />
            <i style={{ left: "74%", width: "22%" }} />
          </span>
        </span>
      </div>
    ),
  },
  {
    key: "guess",
    label: "Today",
    before: [38, 60, 22, 22, -5],
    after: [35, 57, 30, 38],
    mBefore: [4, 66, 52, 13, -4],
    mAfter: [4, 65, 44, 30],
    without: (
      <div className="tf-sticky">
        <b>post at 6pm??</b>
        <small>because someone said so</small>
      </div>
    ),
    with: (
      <div className="tf-today">
        <small>Today</small>
        <b>Post the lighting Reel at 6:30 PM</b>
        <p>Your last 8 Reels after 6 PM had a median of 1.9× your usual views.</p>
        <span className="tf-evidence">From your own posts, 90 days</span>
      </div>
    ),
  },
  {
    key: "publish",
    label: "Publish",
    before: [66, 54, 30, 36, 2],
    after: [67, 57, 30, 38],
    mBefore: [40, 79, 56, 17, 2],
    mAfter: [52, 65, 44, 30],
    without: (
      <div className="tf-apps">
        <small>Uploaded once per app</small>
        <span>
          <PlatformMark platform="instagram" brand />
          <i>Upload, caption, schedule</i>
        </span>
        <span>
          <PlatformMark platform="youtube" brand />
          <i>Upload again, caption again</i>
        </span>
      </div>
    ),
    with: (
      <div className="tf-publish">
        <small>Calendar</small>
        <span className="tf-week">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <i key={i} className={i === 4 ? "is-on" : i === 0 || i === 2 ? "is-done" : ""}>
              {d}
            </i>
          ))}
        </span>
        <span className="tf-sched">
          <PlatformMark platform="instagram" brand />
          <PlatformMark platform="youtube" brand />
          <b>Fri 6:30 PM</b>
          <em>Scheduled</em>
        </span>
      </div>
    ),
  },
];

const style = (p: Panel): CSSProperties =>
  ({
    "--bx": `${p.before[0]}%`,
    "--by": `${p.before[1]}%`,
    "--bw": `${p.before[2]}%`,
    "--bh": `${p.before[3]}%`,
    "--br": `${p.before[4] ?? 0}deg`,
    "--ax": `${p.after[0]}%`,
    "--ay": `${p.after[1]}%`,
    "--aw": `${p.after[2]}%`,
    "--ah": `${p.after[3]}%`,
    "--mbx": `${p.mBefore[0]}%`,
    "--mby": `${p.mBefore[1]}%`,
    "--mbw": `${p.mBefore[2]}%`,
    "--mbh": `${p.mBefore[3]}%`,
    "--mbr": `${p.mBefore[4] ?? 0}deg`,
    "--max": `${p.mAfter[0]}%`,
    "--may": `${p.mAfter[1]}%`,
    "--maw": `${p.mAfter[2]}%`,
    "--mah": `${p.mAfter[3]}%`,
  }) as CSSProperties;

export default function Transform() {
  const [on, setOn] = useState(false);
  return (
    <section className="hm-section tf" id="before-after" aria-labelledby="tf-h">
      <div className="hm-wrap">
        <div className="hm-section-head is-center" data-reveal="children">
          <span className="hm-eyebrow">Before and after</span>
          <h2 id="tf-h" className="hm-h2 is-center">
            Less switching. <em>More creating.</em>
          </h2>
          <p className="hm-lead">Your analytics, ideas, editing, and publishing finally work together.</p>
        </div>

        <div
          className="tf-switch"
          role="radiogroup"
          aria-label="Show the workflow"
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const next = e.key === "ArrowRight";
            setOn(next);
            (e.currentTarget.querySelectorAll("button")[next ? 1 : 0] as HTMLButtonElement | undefined)?.focus();
          }}
        >
          <button type="button" role="radio" aria-checked={!on} tabIndex={on ? -1 : 0} className={!on ? "is-on" : ""} onClick={() => setOn(false)}>
            Without SOCIA
          </button>
          <button type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} className={on ? "is-on" : ""} onClick={() => setOn(true)}>
            With SOCIA
          </button>
          <span className="tf-thumb" aria-hidden style={{ transform: on ? "translateX(100%)" : "none" }} />
        </div>

        <div className={`tf-stage${on ? " is-with" : ""}`} aria-live="polite">
          <div className="tf-chrome" aria-hidden>
            <span className="tf-chrome-bar">
              <b>SOCIA</b>
              <i>Analytics</i>
              <i>Plan</i>
              <i>Create</i>
              <i>Inbox</i>
            </span>
            <svg className="tf-links" viewBox="0 0 100 100" preserveAspectRatio="none">
              {["M33 33 L35 33", "M65 33 L67 33", "M33 76 L35 76", "M65 76 L67 76"].map((d) => (
                <path key={d} d={d} pathLength={1} />
              ))}
            </svg>
          </div>
          {PANELS.map((p) => (
            <div key={p.key} className="tf-panel" style={style(p)}>
              <span className="tf-label">{p.label}</span>
              <div className="tf-face is-without" aria-hidden={on}>
                {p.without}
              </div>
              <div className="tf-face is-with" aria-hidden={!on}>
                {p.with}
              </div>
            </div>
          ))}
          <span className="hm-example tf-example">Example</span>
        </div>
        <p className="tf-caption">
          {on
            ? "One workspace. Each step uses the numbers from the step before it, and every number says where it came from."
            : "Six tools, numbers copied between them, and a guess at the end."}
        </p>
      </div>
    </section>
  );
}

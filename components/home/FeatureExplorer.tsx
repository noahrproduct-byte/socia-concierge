"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PlatformMark } from "@/components/system/PlatformMark";
import { FEATURE_MIN_PLAN, PLANS } from "@/lib/plans";
import ReelDemo from "./ReelDemo";
import { WEEK } from "./exampleWeek";
import "./features.css";

// "Everything you need. One platform.": the ten parts of SOCIA, grouped by
// the job they do (create, edit, understand, plan and publish). Choosing one
// swaps the window on the right to an example of that part's real screen,
// with one line on what it does and a link into it. Every window is labelled
// Example; no number in one is a result anyone measured. The intro film
// (components/intro) is the cinematic moment; this section stays quick.

type Feature = {
  key: string;
  name: string;
  group: "Create" | "Edit" | "Understand" | "Plan and publish";
  /** One line in the list, under the selected name. */
  line: string;
  /** What it does, under the window. */
  does: string;
  /** The screen the window shows, in the app's words. */
  screen: string;
  href: string;
  /** The link's words, signed in. */
  cta: string;
  /** The cheapest plan that includes it, when that is not every plan. */
  plan?: string;
  icon: ReactNode;
  preview: ReactNode;
};

const PHOTO = {
  espresso: "/landing/cafe/espresso.jpg",
  pour: "/landing/cafe/pour-over.jpg",
  pastry: "/landing/cafe/pastry.jpg",
  iced: "/landing/cafe/iced-latte.jpg",
  roast: "/landing/cafe/roast.jpg",
  regulars: "/landing/cafe/regulars.jpg",
  beans: "/landing/cafe/beans.jpg",
  cold: "/landing/cafe/cold-brew.jpg",
  front: "/landing/cafe/storefront.jpg",
};

const Thumb = ({ src, className = "" }: { src: string; className?: string }) => (
  <span className={`fx-thumb ${className}`}>
    <Image src={src} alt="" fill sizes="160px" />
  </span>
);

/** A drawn waveform: fixed heights, so server and browser draw the same thing. */
const Wave = ({ n, seed, className = "" }: { n: number; seed: number; className?: string }) => (
  <span className={`fx-wave ${className}`} aria-hidden>
    {Array.from({ length: n }, (_, i) => (
      <i key={i} style={{ height: `${18 + Math.round(76 * Math.abs(Math.sin(i * 1.3 + seed) * Math.cos(i * 0.47 + seed * 0.7)))}%` }} />
    ))}
  </span>
);

const Icon = ({ children }: { children: ReactNode }) => (
  <svg className="fx-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

const FEATURES: Feature[] = [
  {
    key: "generate",
    name: "Content generation",
    group: "Create",
    line: "Raw clips or a brief in, finished videos out.",
    does: "Drop raw clips or write a short brief. SOCIA finds the moments worth posting, cuts the videos and drafts the posts. Nothing is scheduled until you check it.",
    screen: "Content Studio: Build",
    href: "/studio?mode=clips",
    cta: "Open Content Studio",
    icon: (
      <Icon>
        <rect x="2.5" y="4" width="4.5" height="7" rx="1" />
        <rect x="8" y="4" width="4.5" height="7" rx="1" />
        <rect x="13.5" y="4" width="4" height="7" rx="1" />
        <path d="M3 14.5h14M3 16.5h9" />
      </Icon>
    ),
    preview: (
      <div className="fx-gen">
        <div className="fx-drop">
          <span className="fx-label">12 clips dropped</span>
          <span className="fx-drop-grid">
            {[PHOTO.espresso, PHOTO.pour, PHOTO.pastry, PHOTO.iced, PHOTO.roast, PHOTO.regulars, PHOTO.beans, PHOTO.cold].map((p) => (
              <Thumb key={p} src={p} />
            ))}
          </span>
        </div>
        <ol className="fx-gen-list">
          {[
            [PHOTO.pour, "Pour from higher first", "0:14", "Draft"],
            [PHOTO.pastry, "What comes out of the oven at 7", "0:21", "Draft"],
            [PHOTO.iced, "Iced latte, start to finish", "0:11", "Draft"],
          ].map(([src, title, len, status], i) => (
            <li key={title} style={{ "--i": i } as React.CSSProperties}>
              <Thumb src={src} className="is-tall" />
              <span>
                <b>{title}</b>
                <em>
                  {len}, captions and music, cut from 3 clips
                </em>
              </span>
              <span className="fx-status">{status}</span>
            </li>
          ))}
        </ol>
        <p className="fx-note fx-gen-note">Each draft keeps its cuts, captions and music editable. Approve it and it goes to the plan&apos;s open slot.</p>
      </div>
    ),
  },
  {
    key: "voice",
    name: "Voiceover",
    group: "Create",
    line: "A narrator for videos nobody talks in.",
    does: "For a cut with no one speaking, SOCIA writes a short script from what the footage shows, voices it, and times each line to its shot. The music and the clips' own sound dip under the voice.",
    screen: "Content Studio: Video editor",
    href: "/studio?mode=edit",
    cta: "Open the Video editor",
    icon: (
      <Icon>
        <rect x="7.5" y="2.5" width="5" height="9" rx="2.5" />
        <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
      </Icon>
    ),
    preview: (
      <div className="fx-voice">
        <ol className="fx-script">
          {[
            ["0:00", "Most cafés pour too fast.", PHOTO.espresso],
            ["0:03", "Start high, so the milk sinks under the crema.", PHOTO.pour],
            ["0:07", "Then drop low to draw the pattern.", PHOTO.iced],
            ["0:11", "That is the whole trick.", PHOTO.pastry],
          ].map(([at, text, src], i) => (
            <li key={at} style={{ "--i": i } as React.CSSProperties}>
              <Thumb src={src} />
              <span className="fx-time">{at}</span>
              <span className="fx-line">{text}</span>
            </li>
          ))}
        </ol>
        <div className="fx-lanes">
          <span className="fx-lane">
            <small>Voice</small>
            <span className="fx-lane-track">
              <i className="is-voice" style={{ left: "1%", width: "21%" }} />
              <i className="is-voice" style={{ left: "25%", width: "33%" }} />
              <i className="is-voice" style={{ left: "61%", width: "22%" }} />
              <i className="is-voice" style={{ left: "86%", width: "12%" }} />
            </span>
          </span>
          <span className="fx-lane">
            <small>Music</small>
            <span className="fx-lane-track">
              <Wave n={60} seed={3} className="is-ducked" />
            </span>
          </span>
        </div>
        <p className="fx-note">Every line describes something on screen. Lines that claim more are cut before voicing.</p>
      </div>
    ),
  },
  {
    key: "audio",
    name: "Audio and music",
    group: "Create",
    line: "Music made for the video, mixed under speech.",
    does: "Drop a finished video and SOCIA picks music for its length and pace from the taste you set, then mixes it so the music lowers while someone talks and comes back between.",
    screen: "Content Studio: Audio",
    href: "/studio?mode=audio",
    cta: "Open Audio",
    icon: (
      <Icon>
        <path d="M5 3v14M10 3v14M15 3v14" />
        <rect x="3.5" y="11" width="3" height="2.4" rx="0.8" fill="currentColor" />
        <rect x="8.5" y="5.5" width="3" height="2.4" rx="0.8" fill="currentColor" />
        <rect x="13.5" y="9" width="3" height="2.4" rx="0.8" fill="currentColor" />
      </Icon>
    ),
    preview: (
      <div className="fx-audio">
        <div className="fx-audio-head">
          <Thumb src={PHOTO.regulars} className="is-tall" />
          <span>
            <b>Saturday regulars</b>
            <em>0:24, someone talks from 0:04 to 0:15</em>
            <span className="fx-chips">
              <span className="fx-chip">Warm acoustic</span>
              <span className="fx-chip">84 BPM</span>
              <span className="fx-chip">Made for 0:24</span>
            </span>
          </span>
        </div>
        <div className="fx-lanes">
          <span className="fx-lane">
            <small>Speech</small>
            <span className="fx-lane-track">
              <i className="is-speech" style={{ left: "16%", width: "46%" }} />
            </span>
          </span>
          <span className="fx-lane is-tall">
            <small>Music</small>
            <span className="fx-lane-track">
              <Wave n={72} seed={7} className="has-duck" />
              <span className="fx-duck" style={{ left: "16%", width: "46%" }}>
                <small>Lowered under speech</small>
              </span>
            </span>
          </span>
        </div>
        <div className="fx-faders" aria-hidden>
          {[
            ["Music", 60],
            ["Video sound", 100],
          ].map(([l, v]) => (
            <span key={l} className="fx-fader">
              <small>{l}</small>
              <span>
                <i style={{ width: `${v}%` }} />
              </span>
              <b>{v}%</b>
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    key: "editor",
    name: "Video editor",
    group: "Edit",
    line: "Clips, then a prompt or a video to copy.",
    does: "Put in your clips, then describe the edit or give it a video to copy, or cut it yourself. Captions, transitions, text and sound stay editable on a real timeline.",
    screen: "Content Studio: Video editor",
    href: "/studio?mode=edit",
    cta: "Open the Video editor",
    icon: (
      <Icon>
        <rect x="2.5" y="3" width="15" height="8" rx="1.5" />
        <path d="M2.5 14h9M2.5 17h13M13.5 12.5v6" />
      </Icon>
    ),
    preview: (
      <div className="fx-editor">
        <div className="fx-editor-top">
          <div className="fx-viewer">
            <ReelDemo src="/landing/reel.mp4" poster="/landing/reel.jpg" />
          </div>
          <div className="fx-prompt">
            <span className="fx-label">Prompt</span>
            <p>&ldquo;Close on the pour, captions in the middle, end on the finished cup.&rdquo;</p>
            <span className="fx-label">Made from it</span>
            <ul>
              <li>3 shots, 0:08</li>
              <li>Captions, 3 words at a time</li>
              <li>Cut on the pour, no dissolves</li>
            </ul>
          </div>
        </div>
        <div className="fx-timeline" aria-hidden>
          <span className="fx-playhead" />
          <span className="fx-lane">
            <small>Video</small>
            <span className="fx-lane-track">
              <i className="is-video" style={{ left: "0%", width: "36%" }} />
              <i className="is-video" style={{ left: "37%", width: "33%" }} />
              <i className="is-video" style={{ left: "71%", width: "29%" }} />
            </span>
          </span>
          <span className="fx-lane">
            <small>Text</small>
            <span className="fx-lane-track">
              <i className="is-text" style={{ left: "2%", width: "30%" }} />
              <i className="is-text" style={{ left: "39%", width: "28%" }} />
              <i className="is-text" style={{ left: "73%", width: "24%" }} />
            </span>
          </span>
          <span className="fx-lane">
            <small>Audio</small>
            <span className="fx-lane-track">
              <Wave n={64} seed={2} />
            </span>
          </span>
        </div>
      </div>
    ),
  },
  {
    key: "clipper",
    name: "AI Clipper",
    group: "Edit",
    line: "Long videos into short clips that stand alone.",
    does: "Give it a podcast, talk or stream. It finds the parts that make sense on their own, frames the person speaking for vertical, and adds captions. Pick a look for each clip before it is made.",
    screen: "AI Clipper",
    href: "/clipper",
    cta: "Open the AI Clipper",
    plan: PLANS[FEATURE_MIN_PLAN.ai_clipper].name,
    icon: (
      <Icon>
        <path d="M2.5 10h15" />
        <path d="M6 6.5v7M5 6.5h2M5 13.5h2M12 6.5v7M11 6.5h2M11 13.5h2" />
      </Icon>
    ),
    preview: (
      <div className="fx-clipper">
        <div className="fx-source">
          <span className="fx-source-head">
            <b>Podcast episode 14</b>
            <em>42:10, two speakers</em>
          </span>
          <span className="fx-source-bar" aria-hidden>
            {[
              [7.6, 1.2],
              [42.9, 1],
              [75.5, 1.3],
            ].map(([l, w], i) => (
              <i key={l} style={{ left: `${l}%`, width: `${w + 1.4}%`, "--i": i } as React.CSSProperties} />
            ))}
          </span>
          <span className="fx-source-scale" aria-hidden>
            <small>0:00</small>
            <small>21:00</small>
            <small>42:10</small>
          </span>
        </div>
        <ol className="fx-clips">
          {[
            ["3:12 to 3:41", "A claim, then the number behind it", "Best moments", PHOTO.regulars],
            ["18:05 to 18:30", "A question and a straight answer", "Questions and answers", PHOTO.front],
            ["31:50 to 32:22", "A story that ends on its payoff", "Stories", PHOTO.roast],
          ].map(([when, why, type, src], i) => (
            <li key={when} style={{ "--i": i } as React.CSSProperties}>
              <Thumb src={src} className="is-tall" />
              <span>
                <b>{when}</b>
                <em>{why}</em>
              </span>
              <span className="fx-chip">{type}</span>
            </li>
          ))}
        </ol>
        <div className="fx-looks">
          <span className="fx-label">Look</span>
          <span className="fx-chip is-on">Headline</span>
          <span className="fx-chip">Captions</span>
          <span className="fx-chip">Clean</span>
        </div>
      </div>
    ),
  },
  {
    key: "rater",
    name: "Reel rater",
    group: "Edit",
    line: "Checks a finished video before it goes out.",
    does: "Bring a video you have made. The rater watches it and says what to fix first: the hook, the captions, the ending. It compares with your own Reels, and says how sure it is.",
    screen: "Content Studio: Rate",
    href: "/studio",
    cta: "Open the rater",
    icon: (
      <Icon>
        <rect x="3" y="2.5" width="9" height="15" rx="1.8" />
        <path d="m13.5 8 1.5 1.5 3-3M13.5 13.5l1.5 1.5 3-3" />
      </Icon>
    ),
    preview: (
      <div className="fx-rater">
        <Thumb src={PHOTO.iced} className="fx-rater-video" />
        <div className="fx-rater-body">
          <span className="fx-label">What to fix first</span>
          <ul className="fx-checks">
            <li className="is-fix" style={{ "--i": 0 } as React.CSSProperties}>
              <b>Ending</b>
              <span>It cuts before the finished cup. End 1.5 seconds later.</span>
            </li>
            <li className="is-ok" style={{ "--i": 1 } as React.CSSProperties}>
              <b>Hook</b>
              <span>The pour starts at 0:01. Keep it.</span>
            </li>
            <li className="is-ok" style={{ "--i": 2 } as React.CSSProperties}>
              <b>Captions</b>
              <span>Three words at a time, clear of the cup.</span>
            </li>
          </ul>
          <p className="fx-note">Confidence: low. It rises once your own Reels have results to compare with.</p>
        </div>
      </div>
    ),
  },
  {
    key: "analytics",
    name: "Analytics",
    group: "Understand",
    line: "Every post against your own typical post.",
    does: "Each post is compared with your own median on the same platform, not a stranger's benchmark: what beat it, what fell short, and the pattern behind both.",
    screen: "Analytics",
    href: "/analytics",
    cta: "Open Analytics",
    icon: (
      <Icon>
        <path d="M4 16.5V11M8 16.5V6M12 16.5V9M16 16.5V4" />
        <path d="M2.5 12.5h15" strokeDasharray="1.5 2" />
      </Icon>
    ),
    preview: (
      <div className="fx-analytics">
        <span className="fx-panel-head">
          <b>Top posts, last 30 days</b>
          <em>Instagram, views</em>
        </span>
        <ul className="fx-bars">
          {[
            ["How to make a better latte at home", 100, "2.4×"],
            ["Our new seasonal oat latte", 71, "1.7×"],
            ["Behind the counter: the 6 AM open", 54, "1.3×"],
            ["Your median post", 42, "1.0×"],
            ["Ask the regulars", 34, "0.8×"],
            ["A quiet morning at the cafe", 20, "0.5×"],
          ].map(([title, w, x], i) => (
            <li key={title as string} className={i === 3 ? "is-median" : ""} style={{ "--i": i } as React.CSSProperties}>
              <span>{title}</span>
              <span className="fx-bar">
                <i style={{ width: `${w}%` }} />
              </span>
              <output>{x}</output>
            </li>
          ))}
        </ul>
        <p className="fx-finding">
          <b>Pattern</b> Reels that teach one thing beat your median three times out of four this month.
        </p>
        <p className="fx-note">Views two days after posting, against your last 20 posts at the same age, as Instagram reports them.</p>
      </div>
    ),
  },
  {
    key: "competitors",
    name: "Competitor intelligence",
    group: "Understand",
    line: "What is working for accounts like yours.",
    does: "Follow the accounts you compete with and the ones trending in your niche. See which of their Reels beat their own median, and copy the idea, not the video.",
    screen: "Discover",
    href: "/discover",
    cta: "Open Discover",
    icon: (
      <Icon>
        <circle cx="7" cy="7.5" r="3.2" />
        <circle cx="13.5" cy="7.5" r="3.2" />
        <path d="M2.5 17c.8-2.5 2.5-3.6 4.5-3.6M17.5 17c-.8-2.5-2.5-3.6-4-3.6" />
      </Icon>
    ),
    preview: (
      <div className="fx-comp">
        <ul className="fx-accounts">
          {[
            ["Harbour Coffee Co.", "3.1× their median", "A barista ranks five milks", PHOTO.cold],
            ["Little Bean Bakery", "2.2× their median", "Croissant layers, close up", PHOTO.pastry],
            ["Field Roastery", "0.8× their median", "New single origin", PHOTO.beans],
            ["Corner Espresso Bar", "1.9× their median", "Rush hour, one shot", PHOTO.espresso],
          ].map(([name, vs, reel, src], i) => (
            <li key={name} style={{ "--i": i } as React.CSSProperties}>
              <Thumb src={src} className="is-tall" />
              <span>
                <b>{name}</b>
                <em>{reel}</em>
              </span>
              <span className={`fx-vs${i !== 2 ? " is-up" : ""}`}>{vs}</span>
            </li>
          ))}
        </ul>
        <div className="fx-copy">
          <span className="fx-label">Idea to copy</span>
          <p>Rank what you sell, one item a beat, ending on your pick. Their format, your menu.</p>
          <span className="fx-chips">
            <span className="fx-chip">Add to my plan</span>
          </span>
        </div>
      </div>
    ),
  },
  {
    key: "plan",
    name: "Content planning",
    group: "Plan and publish",
    line: "A week of posts, each with its reason.",
    does: "The Content Plan says what to post each day and why: the format working for you, the gap competitors leave, the time your audience shows up. Accept it, edit it or schedule it.",
    screen: "Content Plan",
    href: "/plan",
    cta: "Open the Content Plan",
    icon: (
      <Icon>
        <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
        <path d="M2.5 7.5h15M6.5 2v3M13.5 2v3" />
        <circle cx="7" cy="11.5" r="0.9" fill="currentColor" />
        <circle cx="13" cy="13.5" r="0.9" fill="currentColor" />
      </Icon>
    ),
    preview: (
      <ul className="fx-week">
        {WEEK.map((w, i) => (
          <li key={w.day} style={{ "--i": i } as React.CSSProperties}>
            <span className="fx-day">{w.day}</span>
            <span className="fx-what">
              <b>{w.title}</b>
              <em>{w.why}</em>
            </span>
            <span className="fx-when">{w.when}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    key: "publish",
    name: "Publishing",
    group: "Plan and publish",
    line: "Schedule to every connected account at once.",
    does: "Schedule one post to Instagram and YouTube together from the Calendar. On a team, members submit and owners or admins approve, and nothing publishes until it is scheduled.",
    screen: "Calendar",
    href: "/plan/calendar",
    cta: "Open the Calendar",
    icon: (
      <Icon>
        <rect x="2.5" y="4" width="15" height="12.5" rx="2" />
        <path d="M10 13.5V8M7.5 10.5 10 8l2.5 2.5" />
      </Icon>
    ),
    preview: (
      <div className="fx-publish">
        <div className="fx-cal" aria-hidden>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
            <span key={d} className={i === 4 ? "is-on" : ""}>
              <small>{d}</small>
              {i === 0 && <i className="is-done" />}
              {i === 2 && <i className="is-done" />}
              {i === 4 && <i className="is-next" />}
            </span>
          ))}
        </div>
        <div className="fx-post">
          <Thumb src={PHOTO.pour} className="is-tall" />
          <div>
            <b>Pour from higher first</b>
            <em>Friday, 6:30 PM</em>
            <ul>
              <li>
                <PlatformMark platform="instagram" brand /> Instagram Reel <span className="fx-status is-on">Scheduled</span>
              </li>
              <li>
                <PlatformMark platform="youtube" brand /> YouTube Short <span className="fx-status is-on">Scheduled</span>
              </li>
            </ul>
          </div>
        </div>
        <p className="fx-note">Posts go out from the platforms&apos; own publishing APIs. You can withdraw one until it goes out.</p>
      </div>
    ),
  },
];

const GROUPS = ["Create", "Edit", "Understand", "Plan and publish"] as const;

export default function FeatureExplorer({ signedIn }: { signedIn: boolean }) {
  const [active, setActive] = useState(FEATURES[0].key);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const rail = useRef<HTMLDivElement>(null);
  const current = FEATURES.find((f) => f.key === active) ?? FEATURES[0];

  // On a phone the list is one sideways row: keep the chosen one in view,
  // scrolling the row only, never the page.
  useEffect(() => {
    const row = rail.current;
    const el = refs.current[active];
    if (!row || !el || row.scrollWidth <= row.clientWidth) return;
    const left = el.offsetLeft - row.offsetLeft - 16;
    if (left < row.scrollLeft || el.offsetLeft - row.offsetLeft + el.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollTo({ left, behavior: "smooth" });
  }, [active]);

  // Arrow keys move through the list, as in any list of tabs.
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? FEATURES.length - 1 : step ? (i + step + FEATURES.length) % FEATURES.length : -1;
    if (to < 0) return;
    e.preventDefault();
    setActive(FEATURES[to].key);
    refs.current[FEATURES[to].key]?.focus();
  };

  return (
    <section className="hm-section fx" id="features" aria-labelledby="fx-h">
      <div className="hm-wrap">
        <div className="hm-section-head fx-head">
          <h2 id="fx-h" className="hm-h2">
            Everything you need. One platform.
          </h2>
          <p className="hm-lead">From your first idea to your next video, SOCIA brings the whole creative workflow together.</p>
        </div>

        <div className="fx-body">
          <div ref={rail} className="fx-rail" role="tablist" aria-orientation="vertical" aria-label="SOCIA features">
            {GROUPS.map((g) => (
              <div key={g} className="fx-group" role="presentation">
                <span className="fx-group-name" role="presentation">
                  {g}
                </span>
                {FEATURES.filter((f) => f.group === g).map((f) => {
                  const i = FEATURES.indexOf(f);
                  const on = f.key === active;
                  return (
                    <button
                      key={f.key}
                      ref={(el) => {
                        refs.current[f.key] = el;
                      }}
                      type="button"
                      role="tab"
                      id={`fx-tab-${f.key}`}
                      aria-selected={on}
                      aria-controls="fx-stage"
                      tabIndex={on ? 0 : -1}
                      className={`fx-item${on ? " is-on" : ""}`}
                      onClick={() => setActive(f.key)}
                      onKeyDown={(e) => onKey(e, i)}
                    >
                      {f.icon}
                      <span className="fx-item-text">
                        <b>{f.name}</b>
                        <span>{f.line}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="fx-stage" id="fx-stage" role="tabpanel" aria-labelledby={`fx-tab-${current.key}`}>
            <div className="fx-window">
              <div className="hm-app-bar">
                <span className="hm-app-dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <span className="hm-app-url">{current.screen}</span>
                <span className="hm-example">Example</span>
              </div>
              <div className="fx-screen" key={current.key}>
                {current.preview}
              </div>
            </div>
            <div className="fx-does">
              <p>
                <b>{current.name}.</b> {current.does}
              </p>
              <div className="fx-does-foot">
                {current.plan && <span className="fx-plan">{current.plan} and up</span>}
                {signedIn ? (
                  <Link href={current.href} className="hm-btn hm-btn--outline">
                    {current.cta} <ArrowRight aria-hidden />
                  </Link>
                ) : current.plan ? (
                  <Link href="/pricing" className="hm-btn hm-btn--outline">
                    See plans <ArrowRight aria-hidden />
                  </Link>
                ) : (
                  <Link href="/signup" className="hm-btn hm-btn--outline">
                    Get started free <ArrowRight aria-hidden />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { PlatformMark } from "@/components/system/PlatformMark";
import { FEATURE_MIN_PLAN, PLANS, type FeatureKey } from "@/lib/plans";
import { awaitingAccessText, platformRequestHref } from "@/lib/platformStatus";
import ReelDemo from "./ReelDemo";
import { WEEK } from "./exampleWeek";
import "./features.css";

// "One platform. Every part of your workflow.": SOCIA's features in five
// groups (create, video, intelligence, strategy, workflow). Choosing a group
// lists its features; choosing a feature swaps the window to an example of
// that feature's real screen, with what it does, the plan it needs (when not
// every plan has it) and a link into it. Only what is built is listed as
// available; the one feature that isn't says "Coming soon". Every window is
// labelled Example, and the examples cover different kinds of creator.

type Group = "Create" | "Video" | "Intelligence" | "Strategy" | "Workflow";

type Feature = {
  key: string;
  name: string;
  group: Group;
  /** One line in the list, under the selected name. */
  line: string;
  /** What it does, under the window. */
  does: string;
  /** The screen the window shows, in the app's words. */
  screen: string;
  href?: string;
  /** The link's words, signed in. */
  cta?: string;
  /** The plan key that decides the cheapest plan, when not every plan has it. */
  gate?: FeatureKey;
  /** Not yet available: says so instead of linking. */
  soon?: boolean;
  icon: ReactNode;
  preview: ReactNode;
};

const GROUPS: { key: Group; line: string }[] = [
  { key: "Create", line: "Ideas, footage, voice and music" },
  { key: "Video", line: "Edit, clip and check" },
  { key: "Intelligence", line: "What's working, and for whom" },
  { key: "Strategy", line: "What to post, when, and why" },
  { key: "Workflow", line: "Schedule, approve, publish" },
];

const C = "/landing/creators";

const Thumb = ({ src, className = "", pos }: { src: string; className?: string; pos?: string }) => (
  <span className={`fx-thumb ${className}`}>
    <Image src={src} alt="" fill sizes="160px" style={pos ? { objectPosition: pos } : undefined} />
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

const i = (n: number) => ({ "--i": n }) as CSSProperties;

const FEATURES: Feature[] = [
  /* ---------------- Create ---------------- */
  {
    key: "ideas",
    name: "Ideas and scripts",
    group: "Create",
    line: "Hooks, a script and a shot list for every planned post.",
    does: "Each post on your plan comes with hooks to choose from, a short script and a shot list for your own space, with a real Reel from your niche as the reference. You film it; the thinking is done.",
    screen: "Plan a post",
    href: "/plan",
    cta: "Open the Content Plan",
    icon: (
      <Icon>
        <path d="M10 2.5a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9Z" />
        <path d="M8 16.5h4M8.5 18.5h3" />
      </Icon>
    ),
    preview: (
      <div className="fx-ideas">
        <div className="fx-ideas-main">
          <span className="fx-panel-head">
            <b>Light a video with one lamp, part 2</b>
            <em>Fri, 6:30 PM, Reel</em>
          </span>
          <span className="fx-label">Hooks</span>
          <ol className="fx-hooks">
            <li className="is-on" style={i(0)}>&ldquo;Your camera isn&apos;t the problem. Your light is.&rdquo;</li>
            <li style={i(1)}>&ldquo;One lamp, three positions.&rdquo;</li>
            <li style={i(2)}>&ldquo;Watch my face, then watch the wall.&rdquo;</li>
          </ol>
          <span className="fx-label">Shot list</span>
          <ol className="fx-shots">
            <li style={i(0)}><b>1</b> Wide: the lamp and the chair, no talking</li>
            <li style={i(1)}><b>2</b> Close: the lamp at 45 degrees</li>
            <li style={i(2)}><b>3</b> Front: before and after, side by side</li>
          </ol>
        </div>
        <div className="fx-ref">
          <Thumb src={`${C}/talking-camera.jpg`} className="is-tall" />
          <span>
            <span className="fx-label">Reference Reel</span>
            <b>@filmwithmaya</b>
            <em>3.1× her median, 6 days ago</em>
          </span>
        </div>
      </div>
    ),
  },
  {
    key: "build",
    name: "Build from clips",
    group: "Create",
    line: "Raw clips in, finished videos out.",
    does: "Drop the clips you already have. SOCIA finds the moments worth posting, cuts the videos and drafts the posts. Nothing is scheduled until you check it.",
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
          <span className="fx-label">6 clips dropped</span>
          <span className="fx-drop-grid">
            {["lighting", "talking-camera", "desk-edit", "vlog-street", "planning-wall", "studio-film"].map((p) => (
              <Thumb key={p} src={`${C}/${p}.jpg`} />
            ))}
          </span>
        </div>
        <ol className="fx-gen-list">
          {[
            ["lighting", "Light a video with one lamp", "0:14"],
            ["planning-wall", "How I plan a month of posts", "0:21"],
            ["desk-edit", "Three edits people skip", "0:11"],
          ].map(([src, title, len], n) => (
            <li key={title} style={i(n)}>
              <Thumb src={`${C}/${src}.jpg`} className="is-tall" />
              <span>
                <b>{title}</b>
                <em>{len}, captions and music, cut from 2 clips</em>
              </span>
              <span className="fx-status">Draft</span>
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
            ["0:00", "Fresh pasta, from the pot to the plate.", "50% 20%"],
            ["0:03", "The water is salted like the sea.", "50% 45%"],
            ["0:07", "It finishes in the pan, never on the plate.", "50% 70%"],
            ["0:11", "Two minutes, start to finish.", "50% 90%"],
          ].map(([at, text, pos], n) => (
            <li key={at} style={i(n)}>
              <Thumb src={`${C}/food.jpg`} pos={pos} />
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
              <i className="is-voice" style={{ left: "25%", width: "24%" }} />
              <i className="is-voice" style={{ left: "52%", width: "28%" }} />
              <i className="is-voice" style={{ left: "84%", width: "14%" }} />
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
    name: "Music and audio",
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
          <Thumb src={`${C}/lifestyle.jpg`} className="is-tall" />
          <span>
            <b>Sunday reset</b>
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

  /* ---------------- Video ---------------- */
  {
    key: "editor",
    name: "Video editor",
    group: "Video",
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
    group: "Video",
    line: "Long videos into short clips that stand alone.",
    does: "Give it a podcast, talk or stream. It finds the parts that make sense on their own, frames the person speaking for vertical, and adds captions. Pick a look for each clip before it is made.",
    screen: "AI Clipper",
    href: "/clipper",
    cta: "Open the AI Clipper",
    gate: "ai_clipper",
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
            <b>The Weekly Build, episode 14</b>
            <em>42:10, two speakers</em>
          </span>
          <span className="fx-source-bar" aria-hidden>
            {[
              [7.6, 1.2],
              [42.9, 1],
              [75.5, 1.3],
            ].map(([l, w], n) => (
              <i key={l} style={{ left: `${l}%`, width: `${w + 1.4}%`, "--i": n } as CSSProperties} />
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
            ["3:12 to 3:41", "A claim, then the number behind it", "Best moments", "podcast-host.jpg", "50% 30%"],
            ["18:05 to 18:30", "A question and a straight answer", "Questions and answers", "podcast-duo.jpg", "70% 40%"],
            ["31:50 to 32:22", "A story that ends on its payoff", "Stories", "podcast-duo.jpg", "25% 40%"],
          ].map(([when, why, type, src, pos], n) => (
            <li key={when} style={i(n)}>
              <Thumb src={`${C}/${src}`} className="is-tall" pos={pos} />
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
    group: "Video",
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
        <Thumb src={`${C}/talking.jpg`} className="fx-rater-video" />
        <div className="fx-rater-body">
          <span className="fx-label">What to fix first</span>
          <ul className="fx-checks">
            <li className="is-fix" style={i(0)}>
              <b>Ending</b>
              <span>You say &ldquo;link in bio&rdquo; after the payoff. End 2 seconds earlier.</span>
            </li>
            <li className="is-ok" style={i(1)}>
              <b>Hook</b>
              <span>Your question lands at 0:01. Keep it.</span>
            </li>
            <li className="is-ok" style={i(2)}>
              <b>Captions</b>
              <span>Three words at a time, clear of your face.</span>
            </li>
          </ul>
          <p className="fx-note">Confidence: low. It rises once your own Reels have results to compare with.</p>
        </div>
      </div>
    ),
  },

  /* ---------------- Intelligence ---------------- */
  {
    key: "analytics",
    name: "Analytics",
    group: "Intelligence",
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
          <span className="fx-who">
            <Thumb src={`${C}/education.jpg`} className="fx-avatar" pos="60% 18%" />
            <b>Top posts, last 30 days</b>
          </span>
          <em>Instagram, views. An educator&apos;s account</em>
        </span>
        <ul className="fx-bars">
          {[
            ["Three charts that explain inflation", 100, "2.4×"],
            ["Why your rent went up", 71, "1.7×"],
            ["Compound interest in 40 seconds", 54, "1.3×"],
            ["Your median post", 42, "1.0×"],
            ["Your questions, answered", 34, "0.8×"],
            ["A tour of my studio", 20, "0.5×"],
          ].map(([title, w, x], n) => (
            <li key={title as string} className={n === 3 ? "is-median" : ""} style={i(n)}>
              <span>{title}</span>
              <span className="fx-bar">
                <i style={{ width: `${w}%` }} />
              </span>
              <output>{x}</output>
            </li>
          ))}
        </ul>
        <p className="fx-finding">
          <b>Pattern</b> Explainers built on one chart beat your median 5 times out of 6 this month.
        </p>
        <p className="fx-note">Views two days after posting, against your last 20 posts at the same age, as Instagram reports them.</p>
      </div>
    ),
  },
  {
    key: "competitors",
    name: "Competitor tracking",
    group: "Intelligence",
    line: "Which of their posts beat their own median.",
    does: "Follow the accounts you compete with. See which of their posts beat their own median, not just which got big numbers, and copy the idea, not the video.",
    screen: "Discover: Competitors",
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
            ["Glow Lab Skin", "3.1× their median", "Morning vs evening routine", true, "glow-lab"],
            ["Dr. Ana Sousa", "2.2× her median", "What SPF numbers mean", true, "ana-sousa"],
            ["Simple Skin Co.", "0.8× their median", "New bottle design", false, "simple-skin"],
            ["The Serum Edit", "1.9× their median", "Three ingredients to skip", true, "serum-edit"],
          ].map(([name, vs, post, up, av], n) => (
            <li key={name as string} style={i(n)}>
              <Image className="fx-acct-avatar" src={`/landing/avatars/${av}.jpg`} alt="" width={80} height={80} sizes="40px" />
              <span>
                <b>{name}</b>
                <em>Top post: {post}</em>
              </span>
              <span className={`fx-vs${up ? " is-up" : ""}`}>{vs}</span>
            </li>
          ))}
        </ul>
        <div className="fx-copy">
          <span className="fx-label">Idea to copy</span>
          <p>Morning against evening, side by side, one product each. Their format, your shelf.</p>
          <span className="fx-chips">
            <span className="fx-chip">Add to my plan</span>
          </span>
        </div>
      </div>
    ),
  },
  {
    key: "trending",
    name: "Trending in your niche",
    group: "Intelligence",
    line: "Reels and accounts rising in your niche this week.",
    does: "SOCIA watches the accounts and Reels moving in your niche, not just the ones you follow, and shows which formats are working right now, each with a real Reel to look at.",
    screen: "Discover: Trending",
    href: "/discover",
    cta: "Open Discover",
    gate: "niche_intelligence",
    icon: (
      <Icon>
        <path d="M2.5 14.5 7.5 9.5l3 3 6-6.5" />
        <path d="M12.5 6h4v4" />
      </Icon>
    ),
    preview: (
      <div className="fx-trend">
        <span className="fx-panel-head">
          <b>Reels you can copy</b>
          <em>Small business and SaaS, this week</em>
        </span>
        <ul className="fx-trend-list">
          {[
            ["saas-demo.jpg", "Founder demos one feature in 30 seconds", "4.2× their median", "3 days ago", "60% 50%"],
            ["business.jpg", "“What I'd do differently”, to camera", "3.4× their median", "5 days ago", "50% 30%"],
            ["studio-bts.jpg", "Behind the scenes of a launch", "2.7× their median", "6 days ago", "40% 50%"],
          ].map(([src, t, vs, when, pos], n) => (
            <li key={t} style={i(n)}>
              <Thumb src={`${C}/${src}`} className="is-tall" pos={pos} />
              <span>
                <b>{t}</b>
                <em>
                  {vs}, {when}
                </em>
              </span>
              <span className="fx-chip">Copy idea</span>
            </li>
          ))}
        </ul>
        <p className="fx-note">Ranked by views against each account&apos;s own median, from public posts.</p>
      </div>
    ),
  },

  /* ---------------- Strategy ---------------- */
  {
    key: "plan",
    name: "Weekly Content Plan",
    group: "Strategy",
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
        {WEEK.map((w, n) => (
          <li key={w.day} style={i(n)}>
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
    key: "gaps",
    name: "Competitor-based strategy",
    group: "Strategy",
    line: "What your competitors do that you don't, and whether to.",
    does: "The Content Plan reads the competitors you track: what they post, how often, and what beats their own median, against your own posts. Gaps worth filling become slots; gaps without evidence stay out.",
    screen: "Content Plan: what the plan reads",
    href: "/plan",
    cta: "Open the Content Plan",
    icon: (
      <Icon>
        <path d="M3 16.5h14" />
        <rect x="4" y="9" width="3" height="7.5" rx="0.6" />
        <rect x="8.5" y="5" width="3" height="11.5" rx="0.6" strokeDasharray="1.6 1.6" />
        <rect x="13" y="7" width="3" height="9.5" rx="0.6" />
      </Icon>
    ),
    preview: (
      <div className="fx-gaps">
        <span className="fx-panel-head">
          <b>Formats: your 3 competitors against you</b>
          <em>Last 90 days</em>
        </span>
        <table className="fx-gap-table">
          <thead>
            <tr>
              <th>Format</th>
              <th>Competitors</th>
              <th>You</th>
              <th>SOCIA says</th>
            </tr>
          </thead>
          <tbody>
            <tr style={i(0)}>
              <td>Story carousels</td>
              <td>2 of 3, weekly</td>
              <td>None</td>
              <td><span className="fx-verdict is-add">Add one on Wednesday</span></td>
            </tr>
            <tr style={i(1)}>
              <td>Form tutorials</td>
              <td>3 of 3</td>
              <td>8 posts, 1.8× median</td>
              <td><span className="fx-verdict is-keep">Keep, it works for you</span></td>
            </tr>
            <tr style={i(2)}>
              <td>Live Q&amp;A</td>
              <td>1 of 3</td>
              <td>None</td>
              <td><span className="fx-verdict is-unknown">Not enough evidence yet</span></td>
            </tr>
          </tbody>
        </table>
        <p className="fx-note">A gap only becomes a plan slot when it beats the competitor&apos;s own median. One account doing it isn&apos;t a trend.</p>
      </div>
    ),
  },
  {
    key: "today",
    name: "Daily recommendations",
    group: "Strategy",
    line: "The few things worth doing today.",
    does: "Each morning the Dashboard's Today card lists the few things worth doing that day, each with the numbers behind it: what to post, a breakout to follow up, comments waiting.",
    screen: "Dashboard: Today",
    href: "/dashboard",
    cta: "Open the Dashboard",
    gate: "daily_recommendations",
    icon: (
      <Icon>
        <circle cx="10" cy="10" r="3.2" />
        <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
      </Icon>
    ),
    preview: (
      <ul className="fx-today">
        {[
          ["Today's post goes out at 6:30 PM", "“Three edits people skip”, inside your best window, 5 to 7 PM", "desk-edit.jpg"],
          ["Your lighting Reel is taking off", "2.4× your median views at the same age, two days in", "lighting.jpg"],
          ["3 comments waiting for a reply", "Each has a reply drafted, ready to review", ""],
        ].map(([t, s, img], n) => (
          <li key={t} style={i(n)}>
            {img ? <Thumb src={`${C}/${img}`} className="is-tall" /> : <span className="fx-today-dot" aria-hidden />}
            <span>
              <b>{t}</b>
              <em>{s}</em>
            </span>
            <span className="fx-why">Why?</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    key: "times",
    name: "Best posting times",
    group: "Strategy",
    line: "When your own audience shows up.",
    does: "SOCIA splits your posts into two-hour windows in your time zone and compares each window's median with your overall one. Windows with too few posts are left out instead of guessed.",
    screen: "Analytics: posting times",
    href: "/analytics",
    cta: "See posting times",
    gate: "posting_time_analysis",
    icon: (
      <Icon>
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 5.5V10l3 2" />
      </Icon>
    ),
    preview: (
      <div className="fx-times">
        <span className="fx-panel-head">
          <b>Views against your median, by start time</b>
          <em>Last 90 days, your time zone</em>
        </span>
        <ul className="fx-slots">
          {[
            ["7 to 9 AM", 0.9, 22],
            ["11 AM to 1 PM", 1.2, 27],
            ["1 to 3 PM", 0.8, 21],
            ["5 to 7 PM", 1.6, 31],
            ["9 to 11 PM", null, 6],
          ].map(([w, x, posts], n) => (
            <li key={w as string} className={x === 1.6 ? "is-best" : x === null ? "is-thin" : ""} style={i(n)}>
              <span>{w}</span>
              <span className="fx-bar">{x !== null && <i style={{ width: `${((x as number) / 1.8) * 100}%` }} />}</span>
              <output>{x === null ? "Too few" : `${(x as number).toFixed(1)}×`}</output>
              <small>{posts} posts</small>
            </li>
          ))}
        </ul>
        <p className="fx-note">Windows with fewer than 20 posts are left out instead of guessed.</p>
      </div>
    ),
  },

  /* ---------------- Workflow ---------------- */
  {
    key: "publish",
    name: "Calendar and publishing",
    group: "Workflow",
    line: "One post to every connected account.",
    does: "Schedule one post to Instagram and YouTube together from the Calendar. Nothing publishes until it is scheduled, and you can withdraw a post until it goes out.",
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
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, n) => (
            <span key={d} className={n === 4 ? "is-on" : ""}>
              <small>{d}</small>
              {n === 0 && <i className="is-done" />}
              {n === 2 && <i className="is-done" />}
              {n === 4 && <i className="is-next" />}
            </span>
          ))}
        </div>
        <div className="fx-post">
          <Thumb src={`${C}/lighting.jpg`} className="is-tall" />
          <div>
            <b>Light a video with one lamp, part 2</b>
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
        <p className="fx-note">Posts go out through the platforms&apos; own publishing APIs.</p>
      </div>
    ),
  },
  {
    key: "approvals",
    name: "Approvals",
    group: "Workflow",
    line: "Members submit, owners approve.",
    does: "Team members submit posts, owners and admins approve them, and approving is scheduling. Everyone sees the same Calendar and gets their own notifications.",
    screen: "Calendar: approvals",
    href: "/plan/calendar",
    cta: "Open the Calendar",
    gate: "approval_workflow",
    icon: (
      <Icon>
        <circle cx="7" cy="7" r="3" />
        <path d="M2.5 16c.6-2.6 2.4-4 4.5-4s3 .8 3.7 2" />
        <path d="m12 14 1.8 1.8 3.7-3.8" />
      </Icon>
    ),
    preview: (
      <div className="fx-approve">
        <span className="fx-panel-head">
          <b>Waiting for approval</b>
          <em>2 posts</em>
        </span>
        {WEEK.filter((w) => w.status === "Needs approval").map((w, n) => (
          <div key={w.day} className="fx-approve-item" style={i(n)}>
            <Thumb src={w.img} className="is-tall" />
            <span>
              <b>{w.title}</b>
              <em>
                Submitted by Sam, for {w.day} {w.when}, {w.where}
              </em>
            </span>
            <span className="fx-chips">
              <span className="fx-chip">Edit</span>
              <span className="fx-chip is-on">Approve</span>
            </span>
          </div>
        ))}
        <p className="fx-note">Approving schedules the post. Nothing publishes by accident.</p>
      </div>
    ),
  },
  {
    key: "inbox",
    name: "Comments inbox",
    group: "Workflow",
    line: "Replies drafted in your voice, sent when you say.",
    does: "New comments arrive in one inbox with a reply drafted from the way you have replied before. Nothing is sent until you approve it, and you can edit every word.",
    screen: "Comments",
    href: "/comments",
    cta: "Open the inbox",
    gate: "comment_replies",
    icon: (
      <Icon>
        <path d="M3 4.5h14v9H8l-4 3v-3H3z" />
        <path d="M6.5 8h7M6.5 10.5h4.5" />
      </Icon>
    ),
    preview: (
      <div className="fx-inbox">
        <div className="fx-comment" style={i(0)}>
          <b>@jess.films</b>
          <p>Does this work with a ring light too?</p>
          <em>On &ldquo;Light a video with one lamp&rdquo;, 2 h ago</em>
        </div>
        <div className="fx-reply" style={i(1)}>
          <span className="fx-label">Drafted reply</span>
          <p>It does! Same 45 degrees, just keep it off to one side so your glasses don&apos;t catch it.</p>
          <span className="fx-chips">
            <span className="fx-chip">Edit</span>
            <span className="fx-chip is-on">Send reply</span>
          </span>
        </div>
        <p className="fx-note">Drafted from your past replies. Nothing is sent until you press Send.</p>
      </div>
    ),
  },
  {
    key: "assistants",
    name: "AI assistants",
    group: "Workflow",
    line: "Ask Claude or ChatGPT about your own numbers.",
    does: "Connect the assistant you already use. It can read your SOCIA data on every plan, and draft and schedule posts on paid plans. It never sees your logins.",
    screen: "Claude, connected to SOCIA",
    href: "/settings",
    cta: "Open Settings",
    icon: (
      <Icon>
        <path d="M7 5 2.5 10 7 15M13 5l4.5 5L13 15" />
      </Icon>
    ),
    preview: (
      <div className="fx-chat">
        <p className="fx-chat-q" style={i(0)}>How did my last five Reels do?</p>
        <div className="fx-chat-a" style={i(1)}>
          <span className="fx-label">Using SOCIA: top posts, last 30 days</span>
          <p>
            Three beat your median: the lighting Reel (2.4×), the week-in-a-day Reel (1.1×) and the desk tour (1.3×). The studio tour and
            the city walk photo fell short (0.8× and 0.6×).
          </p>
        </div>
        <p className="fx-note">Read access on every plan. Drafting and scheduling on paid plans.</p>
      </div>
    ),
  },
  {
    key: "accounts",
    name: "Connected accounts",
    group: "Workflow",
    line: "Instagram and YouTube today.",
    does: "Connect Instagram and YouTube with each platform's own sign-in. Facebook and TikTok are waiting on platform access; email us and we'll tell you when they open.",
    screen: "Settings: connections",
    href: "/settings",
    cta: "Open Settings",
    icon: (
      <Icon>
        <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1" />
        <path d="M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1" />
      </Icon>
    ),
    preview: (
      <ul className="fx-conns">
        <li style={i(0)}>
          <PlatformMark platform="instagram" brand />
          <span>
            <b>Instagram</b>
            <em>Analytics, scheduling and publishing</em>
          </span>
          <span className="fx-status is-on">Available</span>
        </li>
        <li style={i(1)}>
          <PlatformMark platform="youtube" brand />
          <span>
            <b>YouTube</b>
            <em>Analytics, video and Shorts uploads</em>
          </span>
          <span className="fx-status is-on">Available</span>
        </li>
        {(["facebook", "tiktok"] as const).map((p, n) => (
          <li key={p} style={i(n + 2)} className="is-pending">
            <PlatformMark platform={p} brand />
            <span>
              <b>{p === "facebook" ? "Facebook" : "TikTok"}</b>
              <em>{awaitingAccessText(p)}</em>
            </span>
            <a className="fx-chip fx-contact" href={platformRequestHref(p)}>
              <Mail aria-hidden /> Contact us
            </a>
          </li>
        ))}
      </ul>
    ),
  },
  {
    key: "api",
    name: "Developer API",
    group: "Workflow",
    line: "Your SOCIA data in your own tools.",
    does: "A developer API for Pro, to read your SOCIA data from your own tools and reports. It is being built and isn't available yet.",
    screen: "Developer API",
    soon: true,
    gate: "developer_api",
    icon: (
      <Icon>
        <path d="M6 6 2.5 10 6 14M14 6l3.5 4-3.5 4M11.5 4l-3 12" />
      </Icon>
    ),
    preview: (
      <div className="fx-soon">
        <span className="fx-status">Coming soon</span>
        <p>Not available yet. Until it is, AI assistants can read the same data on every plan.</p>
      </div>
    ),
  },
];

const AUTO_MS = 5000;

const planOf = (f: Feature) => (f.gate && FEATURE_MIN_PLAN[f.gate] !== "free" ? PLANS[FEATURE_MIN_PLAN[f.gate]].name : null);

export default function FeatureExplorer({ signedIn }: { signedIn: boolean }) {
  const [group, setGroup] = useState<Group>("Create");
  const [active, setActive] = useState<Record<Group, string>>(() =>
    Object.fromEntries(GROUPS.map((g) => [g.key, FEATURES.find((f) => f.group === g.key)!.key])) as Record<Group, string>,
  );
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const section = useRef<HTMLElement>(null);
  // The groups play through on their own, five seconds each, while the
  // section is on screen (Noah, 2026-11-12). The first click, key press or
  // tap inside the section hands control to the visitor for good. Reduced
  // motion never plays them.
  const [auto, setAuto] = useState(true);
  const [inView, setInView] = useState(false);
  const stopAuto = () => setAuto(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setAuto(false);
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!auto || !inView) return;
    const t = window.setTimeout(() => {
      const n = GROUPS.findIndex((g) => g.key === group);
      setGroup(GROUPS[(n + 1) % GROUPS.length].key);
    }, AUTO_MS);
    return () => window.clearTimeout(t);
  }, [auto, inView, group]);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const list = useRef<HTMLDivElement>(null);
  const items = FEATURES.filter((f) => f.group === group);
  const current = FEATURES.find((f) => f.key === active[group]) ?? items[0];
  const plan = planOf(current);

  // On a phone the features are one sideways row: keep the chosen one in
  // view, scrolling the row only, never the page.
  useEffect(() => {
    const row = list.current;
    const el = itemRefs.current[current.key];
    if (!row || !el || row.scrollWidth <= row.clientWidth) return;
    const left = el.offsetLeft - row.offsetLeft - 16;
    if (left < row.scrollLeft || el.offsetLeft - row.offsetLeft + el.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollTo({ left, behavior: "smooth" });
  }, [current.key]);

  // The group row scrolls sideways on a phone: keep the chosen group in view there too.
  const cats = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = cats.current;
    const el = tabRefs.current[group];
    if (!row || !el || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: el.offsetLeft - row.offsetLeft - 16, behavior: "smooth" });
  }, [group]);

  const pick = (key: string) => setActive((a) => ({ ...a, [group]: key }));

  // Arrow keys move along the groups, and along the features in a group.
  const onGroupKey = (e: KeyboardEvent<HTMLButtonElement>, n: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const to = GROUPS[(n + step + GROUPS.length) % GROUPS.length].key;
    setGroup(to);
    tabRefs.current[to]?.focus();
  };
  const onItemKey = (e: KeyboardEvent<HTMLButtonElement>, n: number) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : step ? (n + step + items.length) % items.length : -1;
    if (to < 0) return;
    e.preventDefault();
    pick(items[to].key);
    itemRefs.current[items[to].key]?.focus();
  };

  return (
    <section ref={section} className={`hm-section fx${auto && inView ? " is-auto" : ""}`} id="features" aria-labelledby="fx-h" onPointerDown={stopAuto} onKeyDown={stopAuto}>
      <div className="hm-wrap">
        <div className="hm-section-head fx-head">
          <span className="hm-eyebrow">Features</span>
          <h2 id="fx-h" className="hm-h2">
            One platform. <em>Every part of your workflow.</em>
          </h2>
          <p className="hm-lead">Research, plan, create, edit, analyze, and publish with tools that work together.</p>
        </div>

        <div ref={cats} className="fx-cats" role="tablist" aria-label="Feature groups">
          {GROUPS.map((g, n) => {
            const on = g.key === group;
            return (
              <button
                key={g.key}
                ref={(el) => {
                  tabRefs.current[g.key] = el;
                }}
                type="button"
                role="tab"
                id={`fx-cat-${g.key}`}
                aria-selected={on}
                aria-controls="fx-panel"
                tabIndex={on ? 0 : -1}
                className={`fx-cat${on ? " is-on" : ""}`}
                onClick={() => setGroup(g.key)}
                onKeyDown={(e) => onGroupKey(e, n)}
              >
                <b>{g.key}</b>
                <span>{g.line}</span>
                <small>{FEATURES.filter((f) => f.group === g.key).length}</small>
                {on && auto && <i className="fx-cat-timer" aria-hidden style={{ animationDuration: `${AUTO_MS}ms` }} />}
              </button>
            );
          })}
        </div>

        <div className="fx-body" id="fx-panel" role="tabpanel" aria-labelledby={`fx-cat-${group}`}>
          <div ref={list} className="fx-rail" role="tablist" aria-orientation="vertical" aria-label={`${group} features`} key={group}>
            {items.map((f, n) => {
              const on = f.key === current.key;
              const p = planOf(f);
              return (
                <button
                  key={f.key}
                  ref={(el) => {
                    itemRefs.current[f.key] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`fx-tab-${f.key}`}
                  aria-selected={on}
                  aria-controls="fx-stage"
                  tabIndex={on ? 0 : -1}
                  className={`fx-item${on ? " is-on" : ""}`}
                  onClick={() => pick(f.key)}
                  onKeyDown={(e) => onItemKey(e, n)}
                  style={i(n)}
                >
                  {f.icon}
                  <span className="fx-item-text">
                    <b>
                      {f.name}
                      {f.soon ? <i className="fx-tag is-soon">Coming soon</i> : p ? <i className="fx-tag">{p}</i> : null}
                    </b>
                    <span>{f.line}</span>
                  </span>
                </button>
              );
            })}
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
                {current.soon ? (
                  <span className="fx-plan">Coming soon</span>
                ) : (
                  <>
                    {plan && <span className="fx-plan">{plan} and up</span>}
                    {signedIn && current.href ? (
                      <Link href={current.href} className="hm-btn hm-btn--outline">
                        {current.cta} <ArrowRight aria-hidden />
                      </Link>
                    ) : plan ? (
                      <Link href="/pricing" className="hm-btn hm-btn--outline">
                        See plans <ArrowRight aria-hidden />
                      </Link>
                    ) : (
                      <Link href="/signup" className="hm-btn hm-btn--outline">
                        Get started free <ArrowRight aria-hidden />
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

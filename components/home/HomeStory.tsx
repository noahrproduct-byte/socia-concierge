"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Clapperboard,
  Clock,
  ClipboardList,
  RefreshCw,
  ScanSearch,
  Send,
  Target,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { PlatformMark } from "@/components/system/PlatformMark";
import { WEEK } from "./exampleWeek";

// Sections carried over from the live sociaos.com homepage (CinematicLanding on
// main), rebuilt in this page's system: the four "problem" mini-charts, the
// orbit loop, the Ask SOCIA conversation and the before/after comparison.
// What changed on the way, against docs/design/anti-slop-standard.md:
// - every number is the example café's, labelled, with its basis and window
//   (the live versions used unlabelled figures, "Competitor A/B" and
//   predicted scores, which are P0);
// - the conversation appears message by message, never typed out (17.2);
// - motion plays once as each section enters and is skipped entirely under
//   prefers-reduced-motion; the orbit's marker circles continuously only
//   while on screen, and stops for good as soon as someone picks a stage.

/* ---------------- shared ---------------- */

function useInView<T extends HTMLElement>(threshold = 0.25): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setInView(true), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView];
}

function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.2);
  return (
    <div ref={ref} className={`hmx-rise${inView ? " in" : ""}${className ? ` ${className}` : ""}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** A small polyline chart, drawn in when it enters view. */
function Line({ values, max, className, w = 340, h = 120 }: { values: number[]; max: number; className?: string; w?: number; h?: number }) {
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 20) + 10).toFixed(1)},${(h - 10 - (v / max) * (h - 24)).toFixed(1)}`);
  return <polyline className={`hmx-draw ${className ?? ""}`} points={pts.join(" ")} fill="none" pathLength={1} />;
}

/* ---------------- 1. the problem, four mini-charts ---------------- */

/** Posts per day on an example account before a plan: four weeks, Monday first. */
const WEEKS = [
  [0, 0, 2, 0, 0, 0, 1],
  [0, 1, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 0, 1, 0],
  [1, 0, 0, 1, 0, 0, 0],
];
const POSTED_DAYS = WEEKS.flat().filter((n) => n > 0).length;

/** Four recent posts: views two days after posting, against the median at the same age. */
const POSTS = [
  { src: "/landing/cafe/storefront.jpg", t: "A quiet morning", x: 0.5 },
  { src: "/landing/cafe/pastry.jpg", t: "New pastry case", x: 0.8 },
  { src: "/landing/reel.jpg", t: "Latte at home", x: 2.4 },
  { src: "/landing/cafe/espresso.jpg", t: "Espresso, close up", x: 0.6 },
];

/** Story carousels from the three competitors you follow: median interactions per post, last 8 weeks. */
const NICHE = [88, 92, 95, 104, 118, 131, 149, 162];
/** Median interactions per post, last 8 weeks. */
const RACE = {
  you: [131, 128, 136, 133, 139, 135, 141, 142],
  harbor: [150, 158, 163, 171, 178, 186, 194, 201],
  eastside: [176, 181, 190, 196, 205, 212, 221, 228],
};
const pct = (a: number[]) => Math.round(((a[a.length - 1] - a[0]) / a[0]) * 100);

export function Problem() {
  const [ref, inView] = useInView<HTMLDivElement>(0.15);
  return (
    <section className="hm-section" id="problem" aria-labelledby="hm-problem">
      <div className="hm-wrap">
        <div className="hm-section-head is-center" data-reveal="children">
          <span className="hm-eyebrow">The problem</span>
          <h2 id="hm-problem" className="hm-h2 is-center">
            Posting shouldn&apos;t be guesswork.
          </h2>
          <p className="hm-lead">
            Most accounts still decide what to post from instinct, a scattered set of apps, and whatever worked last
            week. SOCIA turns those signals into decisions.
          </p>
        </div>

        <div ref={ref} className={`hmx-probgrid${inView ? " in" : ""}`}>
          {/* no plan */}
          <article className="hmx-pcard">
            <header>
              <CalendarDays aria-hidden /> No clear plan <span className="hm-example">Example</span>
            </header>
            <div className="hmx-pcols">
              <div className="hmx-pcopy">
                <p>Posting without a plan makes results hard to read.</p>
                <small>Days with a post, last 4 weeks</small>
                <b>
                  {POSTED_DAYS} of 28
                </b>
                <span className="hmx-meter">
                  <em style={{ width: `${(POSTED_DAYS / 28) * 100}%` }} />
                </span>
              </div>
              <div className="hmx-weekdots" role="img" aria-label={`Posting days over four weeks: posted on ${POSTED_DAYS} of 28 days`}>
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <span key={i} className="hmx-wd">
                    {d}
                  </span>
                ))}
                {WEEKS.flatMap((week, w) =>
                  week.map((n, d) => (
                    <span key={`${w}-${d}`} className={`hmx-dot n${n}`} style={{ "--i": w * 7 + d } as CSSProperties} />
                  )),
                )}
              </div>
            </div>
          </article>

          {/* guessing */}
          <article className="hmx-pcard">
            <header>
              <TrendingUp aria-hidden /> Guessing what works <span className="hm-example">Example</span>
            </header>
            <div className="hmx-pcols">
              <div className="hmx-pcopy">
                <p>Without a baseline, one good post looks like luck.</p>
                <small>Posts that beat your median</small>
                <b>1 of 4</b>
                <span className="hmx-meter">
                  <em style={{ width: "25%" }} />
                </span>
              </div>
              <div className="hmx-thumbs">
                {POSTS.map((p, i) => (
                  <figure key={p.t} className={p.x > 1 ? "is-win" : undefined} style={{ "--i": i } as CSSProperties}>
                    <Image src={p.src} alt="" width={84} height={150} sizes="84px" />
                    <b>{p.x.toFixed(1)}×</b>
                    <figcaption>{p.t}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
            <p className="hmx-foot">Views two days after posting, against your median post at the same age.</p>
          </article>

          {/* missed */}
          <article className="hmx-pcard">
            <header>
              <ScanSearch aria-hidden /> Missed opportunities <span className="hm-example">Example</span>
            </header>
            <div className="hmx-pcols is-chart">
              <div className="hmx-pcopy">
                <p>The formats that are working in your niche show up before most accounts notice.</p>
                <span className="hmx-flag">You posted none in 90 days</span>
              </div>
              <div className="hmx-chart">
                <div className="hmx-anno">
                  <small>Story carousels</small>
                  <b>+{pct(NICHE)}%</b>
                  <span>in 8 weeks, across 3 competitors</span>
                </div>
                <svg viewBox="0 0 340 120" preserveAspectRatio="none" aria-hidden>
                  {[0.25, 0.5, 0.75].map((f) => (
                    <line key={f} x1="10" x2="330" y1={120 * f} y2={120 * f} className="hmx-grid" />
                  ))}
                  <Line values={NICHE} max={180} className="is-blue" />
                </svg>
                <div className="hmx-xaxis">
                  <span>8 weeks ago</span>
                  <span>This week</span>
                </div>
              </div>
            </div>
            <p className="hmx-foot">Median interactions per story carousel, three competitors you follow on Instagram.</p>
          </article>

          {/* behind */}
          <article className="hmx-pcard">
            <header>
              <Users aria-hidden /> Falling behind <span className="hm-example">Example</span>
            </header>
            <div className="hmx-pcols is-chart">
              <div className="hmx-pcopy">
                <p>Competitors adjust every week while you are still reading last month&apos;s numbers.</p>
              </div>
              <div className="hmx-chart">
                <div className="hmx-legend">
                  <span>
                    <i className="is-sky" /> Eastside Bean Co. <b>+{pct(RACE.eastside)}%</b>
                  </span>
                  <span>
                    <i className="is-grey" /> Harbor Street Coffee <b>+{pct(RACE.harbor)}%</b>
                  </span>
                  <span>
                    <i className="is-gold" /> You <b>+{pct(RACE.you)}%</b>
                  </span>
                </div>
                <svg viewBox="0 0 340 120" preserveAspectRatio="none" aria-hidden>
                  {[0.25, 0.5, 0.75].map((f) => (
                    <line key={f} x1="10" x2="330" y1={120 * f} y2={120 * f} className="hmx-grid" />
                  ))}
                  <Line values={RACE.eastside.map((v) => v - 100)} max={140} className="is-sky" />
                  <Line values={RACE.harbor.map((v) => v - 100)} max={140} className="is-grey d2" />
                  <Line values={RACE.you.map((v) => v - 100)} max={140} className="is-gold d3" />
                </svg>
                <div className="hmx-xaxis">
                  <span>8 weeks ago</span>
                  <span>This week</span>
                </div>
              </div>
            </div>
            <p className="hmx-foot">Median interactions per post, each week, on Instagram.</p>
          </article>
        </div>

        <Reveal delay={120}>
          <div className="hmx-strip">
            <span className="hmx-strip-ico">
              <ScanSearch aria-hidden />
            </span>
            <div>
              <b>SOCIA connects the signals into one next step.</b>
              <span>Your posts, your audience and your competitors, read together every day.</span>
            </div>
            <svg className="hmx-sig" viewBox="0 0 520 80" preserveAspectRatio="xMidYMid meet" aria-hidden>
              {["M0,12 C120,12 200,38 320,40", "M0,28 C110,26 210,39 320,40", "M0,44 C120,46 200,41 320,40", "M0,60 C130,62 210,42 320,40", "M0,74 C140,74 220,44 320,40"].map(
                (d, i) => (
                  <path key={d} d={d} className="hmx-sig-in" pathLength={1} style={{ "--i": i } as CSSProperties} />
                ),
              )}
              <path d="M320,40 L508,40" className="hmx-sig-out" pathLength={1} />
              <circle cx="320" cy="40" r="3.5" className="hmx-sig-node" />
              <circle cx="508" cy="40" r="2.5" className="hmx-sig-end" />
            </svg>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- 2. the loop, as an orbit ---------------- */

type Stage = {
  t: string;
  short: string;
  Icon: typeof BarChart3;
  head: string;
  feats: [typeof BarChart3, string, string][];
};

const STAGES: Stage[] = [
  {
    t: "Understand",
    short: "See what beat your median.",
    Icon: BarChart3,
    head: "Every post, against your own typical post.",
    feats: [
      [BarChart3, "Compares each post with your median", "On the same platform, at the same age, never a stranger's benchmark."],
      [ScanSearch, "Finds what your winners share", "Format, topic and time, from your own last 90 days."],
      [Users, "Reads your competitors' public posts", "What they post, how often, and what is working for them."],
    ],
  },
  {
    t: "Plan",
    short: "A week built on evidence.",
    Icon: ClipboardList,
    head: "A weekly plan with a reason for every post.",
    feats: [
      [Target, "Ranks what to post this week", "The formats and topics your numbers support."],
      [CalendarDays, "Puts each post in your best window", "Two-hour windows in your own time zone, from your own results."],
      [Check, "Shows the evidence", "Every slot says what it is based on."],
    ],
  },
  {
    t: "Make",
    short: "Footage in, a first cut out.",
    Icon: Clapperboard,
    head: "From the clips you have to a draft you can edit.",
    feats: [
      [Clapperboard, "Finds the usable moments", "Content Studio reads your clips and marks what to use."],
      [ScanSearch, "Cuts a first draft with captions", "Every cut and caption stays editable."],
      [CalendarDays, "Fills the plan's open slot", "The draft lands on your Calendar, not in a folder."],
    ],
  },
  {
    t: "Publish",
    short: "Schedule, approve, post.",
    Icon: Send,
    head: "Posts go out when your audience is there.",
    feats: [
      [Clock, "Schedules to Instagram, Facebook and YouTube", "From one Calendar."],
      [Users, "Approvals for teams and clients", "Members submit; owners and admins approve, and approving schedules."],
      [Check, "Nothing publishes by accident", "Only what is on your Calendar goes out."],
    ],
  },
  {
    t: "Learn",
    short: "Results feed the next plan.",
    Icon: RefreshCw,
    head: "Each week's results shape next week's plan.",
    feats: [
      [TrendingUp, "Reads every result against your median", "And flags a breakout two days in."],
      [RefreshCw, "Feeds the next plan", "A follow-up for what worked, a change for what didn't."],
      [BarChart3, "Says when there isn't enough data yet", "Rather than guessing."],
    ],
  },
];
const N = STAGES.length;
const OR = 246;
const OC = 2 * Math.PI * OR;
/** One full circle of the marker, in ms: about four seconds a stage. */
const LAP = N * 4200;
const STEP = 360 / N;

export function Orbit() {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const [stage, setStage] = useState(0);
  const [manual, setManual] = useState(false);
  const [angle, setAngle] = useState(0);
  const [glide, setGlide] = useState(false);
  const dot = useRef<SVGGElement>(null);
  const run = useRef<Animation | null>(null);

  // the marker travels the full circle, endlessly, while the loop is on
  // screen; each stage lights as it passes. Picking a stage stops it.
  useEffect(() => {
    const g = dot.current;
    if (!inView || !g || manual || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lap = g.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
      duration: LAP,
      iterations: Infinity,
      easing: "linear",
    });
    run.current = lap;
    const id = setInterval(() => {
      if (document.hidden) return lap.pause();
      if (lap.playState === "paused") lap.play();
      const deg = ((Number(lap.currentTime) % LAP) / LAP) * 360;
      setStage(Math.floor(((deg + STEP / 2) % 360) / STEP));
    }, 120);
    return () => {
      clearInterval(id);
      lap.cancel();
      run.current = null;
    };
  }, [inView, manual]);

  const pick = (j: number) => {
    const lap = run.current;
    const now = lap ? ((Number(lap.currentTime) % LAP) / LAP) * 360 : angle;
    setManual(true);
    setStage(j);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGlide(false);
      setAngle(j * STEP);
      return;
    }
    // continue forward from where the marker is to the chosen stage
    setGlide(false);
    setAngle(now);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setGlide(true);
        setAngle(now + (((j * STEP - now) % 360) + 360) % 360);
      }),
    );
  };
  const S = STAGES[stage];

  return (
    <div ref={ref} className={`hmx-orbit${inView ? " in" : ""}`}>
      <div className="hmx-ring">
        <svg viewBox="0 0 560 560" aria-hidden>
          <circle className="hmx-ring-base" cx="280" cy="280" r={OR} />
          <g ref={dot} className={`hmx-ring-dot${glide ? " go" : ""}`} style={{ transform: `rotate(${angle}deg)` }}>
            <circle
              className="hmx-ring-trail"
              cx="280"
              cy="280"
              r={OR}
              strokeDasharray={`${(OC / 5).toFixed(1)} ${OC.toFixed(1)}`}
              transform={`rotate(${-90 - 72} 280 280)`}
            />
            <circle cx="280" cy={280 - OR} r="6" className="hmx-ring-head" />
          </g>
        </svg>
        <div className="hmx-core">
          <BrandMark size={22} /> SOCIA
        </div>
        {STAGES.map((s, i) => {
          const a = (i / N) * Math.PI * 2 - Math.PI / 2;
          const style = { left: `${(50 + 44 * Math.cos(a)).toFixed(3)}%`, top: `${(50 + 44 * Math.sin(a)).toFixed(3)}%` } as CSSProperties;
          return (
            <button key={s.t} type="button" className={`hmx-node${stage === i ? " is-on" : ""}`} style={style} onClick={() => pick(i)} aria-pressed={stage === i}>
              <span>
                <s.Icon aria-hidden />
              </span>
              <b>{s.t}</b>
              <small>{s.short}</small>
            </button>
          );
        })}
      </div>

      <div className="hmx-panel" aria-live="polite">
        <span className="hmx-panel-n">0{stage + 1} of 0{N}</span>
        <div className="hmx-panel-body" key={stage}>
          <h3>{S.t}</h3>
          <p>{S.head}</p>
          <small>What SOCIA does</small>
          <ul>
            {S.feats.map(([Fi, t, d]) => (
              <li key={t}>
                <span>
                  <Fi aria-hidden />
                </span>
                <div>
                  <b>{t}</b>
                  <em>{d}</em>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="hmx-seq">
          {STAGES.map((s, i) => (
            <button key={s.t} type="button" className={stage === i ? "is-on" : undefined} onClick={() => pick(i)}>
              {s.t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- 3. Ask SOCIA ---------------- */

export function AskDemo({ startHref, startLabel }: { startHref: string; startLabel: string }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.35);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(5);
      return;
    }
    const t = [200, 900, 1700, 2500, 3200].map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => t.forEach(clearTimeout);
  }, [inView]);
  const on = (n: number) => (step >= n ? " in" : "");

  return (
    <section className="hm-section" id="ask" aria-labelledby="hm-ask">
      <div className="hm-wrap">
        <div className="hm-section-head is-center" data-reveal="children">
          <span className="hm-eyebrow">Ask SOCIA</span>
          <h2 id="hm-ask" className="hm-h2 is-center">
            Ask anything about your account.
          </h2>
          <p className="hm-lead">
            Answers from your own posts, audience and competitors, with what each answer is based on and a change you can
            apply.
          </p>
        </div>
        <div ref={ref} className="hmx-chat">
          <div className="hmx-chat-head">
            <b>Ask SOCIA</b>
            <span className="hmx-chip">Analytics</span>
            <span className="hmx-chip">Last 90 days</span>
            <span className="hm-example">Example</span>
          </div>
          <div className="hmx-chat-body">
            <p className={`hmx-msg is-user${on(1)}`}>What should I post this week?</p>
            <div className={`hmx-msg is-socia${on(2)}`}>
              <i aria-hidden>S</i>
              <div>
                <small>Observed</small>
                <p>
                  Sunday&apos;s latte Reel has 2.4× your median views at the same age. Your posts between 5 and 7 PM get
                  1.6× your median, across 31 posts.
                </p>
              </div>
            </div>
            <div className={`hmx-msg is-socia is-rec${on(3)}`}>
              <i aria-hidden>S</i>
              <div>
                <small>Recommendation</small>
                <p>
                  Post a follow-up Reel on Friday at 6:30 PM, and add one story carousel on Wednesday, a format two of the
                  three competitors you follow post weekly.
                </p>
              </div>
            </div>
            <div className={`hmx-proposal${on(4)}`}>
              <small>Suggested update | Friday</small>
              <div>
                <span>Current</span>
                <s>Photo: new pastry case</s>
              </div>
              <div>
                <span>New</span>
                <b>Reel: pour from higher first, part 2</b>
              </div>
            </div>
            <div className={`hmx-chat-foot${on(5)}`}>
              <span>SOCIA cites only your own data. Review before publishing.</span>
              <Link href={startHref} className="hm-btn hm-btn--primary hm-btn--sm">
                {startLabel} <ArrowRight aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 4. before and after ---------------- */

const WITHOUT = [
  "Guess what to post",
  "Check three apps for your numbers",
  "Research competitors by hand",
  "Post whenever there's time",
  "Find out a post flopped days later",
];
const WITH = [
  "Know what to post next, and why",
  "Instagram, Facebook and YouTube in one place",
  "Competitor patterns found for you",
  "Post in your own best window",
  "See each result against your median in two days",
];

export function BeforeAfter() {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  return (
    <section className="hm-section" id="before-after" aria-labelledby="hm-ba">
      <div className="hm-wrap">
        <div className="hm-section-head is-center" data-reveal="children">
          <span className="hm-eyebrow">Before and after</span>
          <h2 id="hm-ba" className="hm-h2 is-center">
            Better decisions compound.
          </h2>
        </div>
        <div ref={ref} className={`hmx-ba${inView ? " in" : ""}`}>
          <div className="hmx-ba-col is-without">
            <small>Without SOCIA</small>
            <ul>
              {WITHOUT.map((t, i) => (
                <li key={t} style={{ "--i": i } as CSSProperties}>
                  <X aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="hmx-ba-mid" aria-hidden>
            <svg viewBox="0 0 96 200" preserveAspectRatio="none">
              {["M0,28 C30,28 34,88 46,97", "M0,64 C28,64 34,92 46,99", "M0,100 L46,100", "M0,136 C28,136 34,108 46,101", "M0,172 C30,172 34,112 46,103"].map((d, i) => (
                <path key={d} d={d} pathLength={1} style={{ "--i": i } as CSSProperties} />
              ))}
            </svg>
            <span>
              <ArrowRight />
            </span>
          </div>
          <div className="hmx-ba-col is-with">
            <small>With SOCIA</small>
            <ul>
              {WITH.map((t, i) => (
                <li key={t} style={{ "--i": i } as CSSProperties}>
                  <Check aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 5. how it works, in order ---------------- */

const READ = [0.7, 1.1, 0.8, 1.4, 0.6, 1.0, 2.4, 1.3];

export function Steps() {
  const [ref, inView] = useInView<HTMLOListElement>(0.2);
  return (
    <section className="hm-section" id="how" aria-labelledby="hm-how">
      <div className="hm-wrap">
        <div className="hm-section-head is-center" data-reveal="children">
          <span className="hm-eyebrow">How it works</span>
          <h2 id="hm-how" className="hm-h2 is-center">
            Four steps, every week.
          </h2>
          <p className="hm-lead">From connecting your accounts to next week&apos;s plan, in the order SOCIA does it.</p>
        </div>
        <ol ref={ref} className={`hmx-steps${inView ? " in" : ""}`}>
          <li style={{ "--i": 0 } as CSSProperties}>
            <span className="hmx-step-n">01</span>
            <h3>Connect your accounts</h3>
            <p>Instagram, Facebook and YouTube connect in a minute. SOCIA keeps a daily record from then on.</p>
            <div className="hmx-step-vis hmx-connect">
              {(["instagram", "facebook", "youtube"] as const).map((p, i) => (
                <div key={p} style={{ "--j": i } as CSSProperties}>
                  <PlatformMark platform={p} brand />
                  <span>{p === "instagram" ? "Instagram" : p === "facebook" ? "Facebook" : "YouTube"}</span>
                  <em>
                    <Check aria-hidden /> Connected
                  </em>
                </div>
              ))}
            </div>
          </li>
          <li style={{ "--i": 1 } as CSSProperties}>
            <span className="hmx-step-n">02</span>
            <h3>SOCIA reads your posts</h3>
            <p>Every post is measured against your own median, so you can see what actually worked.</p>
            <div className="hmx-step-vis hmx-read">
              <div className="hmx-read-bars">
                <i className="hmx-read-median" style={{ bottom: `${(1 / 2.6) * 100}%` }} />
                {READ.map((v, i) => (
                  <span key={i} className={v > 1 ? "is-up" : undefined} style={{ height: `${(v / 2.6) * 100}%`, "--k": i } as CSSProperties} />
                ))}
              </div>
              <small>Your last 8 posts against your median (dashed)</small>
            </div>
          </li>
          <li style={{ "--i": 2 } as CSSProperties}>
            <span className="hmx-step-n">03</span>
            <h3>Get your weekly plan</h3>
            <p>What to post each day, when, and the evidence behind every slot.</p>
            <div className="hmx-step-vis hmx-miniweek">
              {WEEK.map((w, i) => (
                <div key={w.day} style={{ "--j": i } as CSSProperties} className={w.day === "Fri" ? "is-pick" : undefined}>
                  <Image src={w.img} alt="" width={96} height={96} sizes="64px" />
                  <b>{w.day}</b>
                  <span>{w.when.replace(":00", "").replace(" PM", "p").replace(" AM", "a")}</span>
                </div>
              ))}
            </div>
          </li>
          <li style={{ "--i": 3 } as CSSProperties}>
            <span className="hmx-step-n">04</span>
            <h3>Make, publish, learn</h3>
            <p>Cut the Reel in Content Studio, schedule it, and its result shapes next week&apos;s plan.</p>
            <div className="hmx-step-vis hmx-flow">
              <div style={{ "--j": 0 } as CSSProperties}>
                <Image src="/landing/reel.jpg" alt="" width={96} height={160} sizes="48px" />
                <span>First cut</span>
              </div>
              <ArrowRight aria-hidden />
              <div style={{ "--j": 1 } as CSSProperties}>
                <CalendarDays aria-hidden />
                <span>Fri, 6:30 PM</span>
              </div>
              <ArrowRight aria-hidden />
              <div style={{ "--j": 2 } as CSSProperties} className="is-result">
                <b>1.8×</b>
                <span>your median</span>
              </div>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}

/* ---------------- 6. the engine: audit to next move ---------------- */

/** SOCIA's Content Score (lib/contentScore.ts): five measured parts, weighted. */
const DIMS: [string, number, number][] = [
  ["Engagement", 82, 35],
  ["Consistency", 67, 25],
  ["Reach", 71, 20],
  ["Timing", 70, 10],
  ["Captions", 100, 10],
];
const SCORE = Math.round(DIMS.reduce((a, [, v, w]) => a + (v * w) / 100, 0));
const RING_C = 2 * Math.PI * 52;

function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 96 + 2).toFixed(1)},${(30 - ((v - min) / (max - min || 1)) * 26).toFixed(1)}`);
  return (
    <svg className="hmx-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts.join(" ")} pathLength={1} />
    </svg>
  );
}

export function Engine() {
  const [ref, inView] = useInView<HTMLDivElement>(0.15);
  return (
    <section className="hm-section" id="engine" aria-labelledby="hm-engine">
      <div className="hm-wrap">
        <div className="hm-section-head is-center" data-reveal="children">
          <span className="hm-eyebrow">The SOCIA engine</span>
          <h2 id="hm-engine" className="hm-h2 is-center">
            Everything from audit to your next move.
          </h2>
          <p className="hm-lead">
            SOCIA watches your content, your competitors and your audience, then turns those signals into the next thing to
            do.
          </p>
        </div>

        <div ref={ref} className={`hmx-engine${inView ? " in" : ""}`}>
          {/* content audit */}
          <article className="hmx-ecard is-audit" style={{ "--i": 0 } as CSSProperties}>
            <header>
              <ScanSearch aria-hidden /> Content audit <span className="hm-example">Example</span>
            </header>
            <div className="hmx-audit">
              <div className="hmx-score">
                <svg viewBox="0 0 120 120" aria-hidden>
                  <circle cx="60" cy="60" r="52" className="hmx-score-bg" />
                  <circle cx="60" cy="60" r="52" className="hmx-score-arc" strokeDasharray={`${((SCORE / 100) * RING_C).toFixed(1)} ${RING_C.toFixed(1)}`} />
                </svg>
                <div>
                  <b>{SCORE}</b>
                  <span>Content Score</span>
                </div>
              </div>
              <ul>
                {DIMS.map(([label, v, w]) => (
                  <li key={label}>
                    <span>
                      {label} <em>{w}%</em>
                    </span>
                    <span className="hmx-track">
                      <i style={{ width: `${v}%` }} />
                    </span>
                    <b>{v}</b>
                  </li>
                ))}
              </ul>
            </div>
            <p className="hmx-foot">Calculated from 64 Instagram posts, last 30 days. Each part is measured, then weighted.</p>
          </article>

          {/* competitor intelligence */}
          <article className="hmx-ecard" style={{ "--i": 1 } as CSSProperties}>
            <header>
              <Users aria-hidden /> Competitor intelligence <span className="hm-example">Example</span>
            </header>
            <ul className="hmx-comps">
              {(
                [
                  ["H", "Harbor Street Coffee", "2 posts above twice their median this week", [150, 158, 163, 171, 178, 186, 194, 201]],
                  ["K", "Kiln Café", "Switched to Reels: 3 this week", [120, 118, 121, 117, 119, 116, 118, 117]],
                  ["E", "Eastside Bean Co.", "Story carousels at 1.4× their median", [176, 181, 190, 196, 205, 212, 221, 228]],
                ] as [string, string, string, number[]][]
              ).map(([i, n, note, vals]) => (
                <li key={n}>
                  <i>{i}</i>
                  <div>
                    <b>{n}</b>
                    <span>{note}</span>
                  </div>
                  <Spark values={vals} />
                </li>
              ))}
            </ul>
            <p className="hmx-foot">Median interactions per post, last 8 weeks, from public posts.</p>
          </article>

          {/* the next move */}
          <article className="hmx-ecard is-next" style={{ "--i": 2 } as CSSProperties}>
            <header>
              <Target aria-hidden /> Your next move <span className="hm-example">Example</span>
            </header>
            <span className="hmx-next-tag">This week</span>
            <h3>Post a follow-up Reel on Friday at 6:30 PM.</h3>
            <Image className="hmx-next-img" src="/landing/reel.jpg" alt="" width={560} height={300} sizes="(max-width: 960px) 100vw, 360px" />
            <small>Why it should work</small>
            <ul className="hmx-why">
              <li>
                <TrendingUp aria-hidden /> Sunday&apos;s latte Reel has 2.4× your median views at the same age.
              </li>
              <li>
                <Clock aria-hidden /> 5 to 7 PM is your best window: 1.6× your median, across 31 posts.
              </li>
              <li>
                <BarChart3 aria-hidden /> Your Reels got 1.8× your median views over the last 90 days.
              </li>
            </ul>
            <span className="hmx-next-status">
              <Check aria-hidden /> On Friday&apos;s slot in this week&apos;s plan
            </span>
          </article>

          {/* content check */}
          <article className="hmx-ecard" style={{ "--i": 3 } as CSSProperties}>
            <header>
              <Clapperboard aria-hidden /> Content check <span className="hm-example">Example</span>
            </header>
            <p className="hmx-ecopy">Before you post, Content Studio lists the top fixes.</p>
            <ul className="hmx-checks">
              <li className="is-fix">
                <b>Hook</b> The pour starts at 0:02. Open on it at 0:00.
              </li>
              <li>
                <b>Caption</b> Five hashtags, within Instagram&apos;s limit.
              </li>
              <li>
                <b>Format</b> 9:16, 8 seconds: fits a Reel.
              </li>
            </ul>
          </article>

          {/* scheduling */}
          <article className="hmx-ecard" style={{ "--i": 4 } as CSSProperties}>
            <header>
              <CalendarDays aria-hidden /> Smart scheduling <span className="hm-example">Example</span>
            </header>
            <div className="hmx-sched">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => {
                const w = WEEK.find((x) => x.day === d);
                return (
                  <div key={d} className={w ? "is-on" : undefined}>
                    <span>{d.slice(0, 1)}</span>
                    <b>{w ? w.when.replace(" PM", "p").replace(" AM", "a").replace(":00", "") : "·"}</b>
                  </div>
                );
              })}
            </div>
            <p className="hmx-foot">Best window 5 to 7 PM: 1.6× your median, across 31 posts, in your time zone.</p>
          </article>
        </div>

        <Reveal delay={150}>
          <div className="hmx-system">
            <div>
              <b>One system, every week.</b>
              <span>Each step feeds the next, and each week starts from what the last one proved.</span>
            </div>
            <ol>
              {["Audit", "Plan", "Make", "Check", "Publish", "Learn"].map((t, i) => (
                <li key={t} style={{ "--i": i } as CSSProperties}>
                  {t}
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- 7. results ---------------- */

/** Last week's planned posts (19 to 25 October): views seven days after posting against the median at the same age. */
const LAST_WEEK = [
  { day: "Mon", t: "Cold brew is back", img: "/landing/cafe/cold-brew.jpg", f: "Reel", x: 1.3 },
  { day: "Tue", t: "How we roast on Tuesdays", img: "/landing/cafe/roast.jpg", f: "Carousel", x: 1.1 },
  { day: "Thu", t: "New pastry case", img: "/landing/cafe/pastry.jpg", f: "Photo", x: 0.8 },
  { day: "Sat", t: "Our corner at 7 AM", img: "/landing/cafe/storefront.jpg", f: "Photo", x: 0.6 },
  { day: "Sun", t: "How to make a better latte at home", img: "/landing/reel.jpg", f: "Reel", x: 2.4 },
];

export function Results() {
  const [ref, inView] = useInView<HTMLDivElement>(0.2);
  const beat = LAST_WEEK.filter((p) => p.x > 1).length;
  return (
    <section className="hm-section" id="results" aria-labelledby="hm-results">
      <div className="hm-wrap">
        <div className="hm-section-head is-center" data-reveal="children">
          <span className="hm-eyebrow">Results</span>
          <h2 id="hm-results" className="hm-h2 is-center">
            See what each plan actually did.
          </h2>
          <p className="hm-lead">Every planned post is measured against your median, and next week&apos;s plan changes because of it.</p>
        </div>
        <div ref={ref} className={`hmx-results${inView ? " in" : ""}`}>
          <div className="hmx-res-table">
            <div className="hmx-res-head">
              <b>Last week&apos;s plan</b>
              <span>19 to 25 October</span>
              <span className="hm-example">Example</span>
            </div>
            {LAST_WEEK.map((p, i) => (
              <div key={p.t} className={`hmx-res-row${p.x > 1 ? " is-up" : ""}`} style={{ "--i": i } as CSSProperties}>
                <Image src={p.img} alt="" width={88} height={88} sizes="44px" />
                <div>
                  <b>{p.t}</b>
                  <span>
                    {p.day} | {p.f}
                  </span>
                </div>
                <span className="hmx-res-bar">
                  <i style={{ width: `${(p.x / 2.6) * 100}%` }} />
                  <em style={{ left: `${(1 / 2.6) * 100}%` }} />
                </span>
                <b className="hmx-res-x">{p.x.toFixed(1)}×</b>
              </div>
            ))}
            <p className="hmx-foot">Views seven days after posting, against your median post at the same age (the line).</p>
          </div>
          <div className="hmx-res-side">
            <div className="hmx-res-stat">
              <b>
                {beat} of {LAST_WEEK.length}
              </b>
              <span>planned posts beat your median</span>
            </div>
            <div className="hmx-res-stat">
              <b>2.4×</b>
              <span>best post: the latte Reel</span>
            </div>
            <div className="hmx-res-next">
              <small>What changes this week</small>
              <ul>
                <li>Reels beat your median again, so this week has three.</li>
                <li>Photos of the space stayed below it, so they are out.</li>
                <li>Sunday&apos;s Reel gets a follow-up on Friday.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

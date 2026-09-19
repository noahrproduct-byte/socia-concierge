"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Sparkles,
  Check,
  X,
  Menu,
  Plus,
  TrendingUp,
  Radar,
  Video,
  CalendarDays,
  ScanSearch,
  Clock,
  Play,
  Send,
  PenLine,
  PieChart,
  BookOpen,
  Zap,
  Target,
  Users,
  LayoutDashboard,
  FileText,
  BarChart3,
  Settings,
} from "lucide-react";
import IntelligenceField from "./IntelligenceField";
import BrandMark from "./BrandMark";

/* ---------------- shared hooks ---------------- */

function useInView<T extends HTMLElement>(threshold = 0.25): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setInView(true); },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView];
}

/** Word-by-word heading reveal. */
function Words({ text, blue }: { text: string; blue?: string }) {
  const [ref, inView] = useInView<HTMLSpanElement>(0.4);
  const words = text.split(" ");
  return (
    <span ref={ref} className={`so-words ${inView ? "in" : ""}`}>
      {words.map((w, i) => (
        <span key={i} className="so-w" style={{ transitionDelay: `${i * 70}ms` }}>
          <span className={blue && blue.split(" ").includes(w) ? "so-blue" : undefined}>{w}</span>{" "}
        </span>
      ))}
    </span>
  );
}

/** Counts up when scrolled into view. */
function Num({ value, suffix = "", duration = 1200 }: { value: number; suffix?: string; duration?: number }) {
  const [ref, inView] = useInView<HTMLSpanElement>(0.6);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(value); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3)) * 10) / 10);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);
  const shown = Number.isInteger(value) ? Math.round(n) : n.toFixed(1);
  return <span ref={ref}>{shown}{suffix}</span>;
}

/** Simple reveal wrapper. */
function Rise({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.2);
  return (
    <div ref={ref} className={`so-rise ${inView ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ---------------- chapters config ---------------- */

const CHAPTERS = [
  { id: "promise", label: "PROMISE", theme: "dark" as const },
  { id: "problem", label: "PROBLEM", theme: "deep" as const },
  { id: "engine", label: "ENGINE", theme: "light" as const },
  { id: "ask", label: "STRATEGIST", theme: "deep" as const },
  { id: "loop", label: "LOOP", theme: "light" as const },
  { id: "results", label: "RESULTS", theme: "light" as const },
  { id: "start", label: "START", theme: "deep" as const },
];

/* ---------------- Ask SOCIA demo ---------------- */

function AskDemo() {
  const [ref, inView] = useInView<HTMLDivElement>(0.35);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setStep(5); return; }
    const times = [300, 1100, 2100, 3100, 3900];
    const t = times.map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => t.forEach(clearTimeout);
  }, [inView]);

  return (
    <div ref={ref} className="so-chat" data-cursor="ASK">
      <div className="so-chat-head">
        <span className="so-chat-dot" /> SOCIA · AI Strategist
        <span className="so-chat-live">reasoning from your data</span>
      </div>
      <div className="so-chat-body">
        <div className={`so-msg user ${step >= 1 ? "in" : ""}`}>What should I post Thursday?</div>
        <div className={`so-msg ai ${step >= 2 ? "in" : ""}`}>
          Your audience is responding strongest to educational short-form content this
          week. I recommend publishing a 20–30 second Reel between <b>6:20–7:00 PM</b>.
        </div>
        <div className={`so-msg ai ${step >= 3 ? "in" : ""}`}>
          Suggested concept: <b>&ldquo;3 content mistakes quietly killing your reach.&rdquo;</b>
        </div>
        <div className={`so-predict ${step >= 4 ? "in" : ""}`}>
          <div className="so-predict-head">
            <span>PREDICTED PERFORMANCE</span>
            <b>+31% above your average</b>
          </div>
          <div className="so-why">
            <span className="so-why-label">WHY THIS SHOULD WORK</span>
            <div className="so-why-grid">
              <span>Hook demand <b className="up">↑ Strong</b></span>
              <span>Audience interest <b className="up">↑ Rising</b></span>
              <span>Posting window <b className="up">↑ Optimal</b></span>
              <span>Competitor saturation <b className="down">↓ Low</b></span>
            </div>
          </div>
        </div>
        <div className={`so-chat-cta ${step >= 5 ? "in" : ""}`}>
          <Link href="/signup" className="so-btn so-btn-blue">Generate this post <ArrowRight size={15} /></Link>
        </div>
      </div>
    </div>
  );
}

/* ---------------- The Loop ---------------- */

const LOOP_N = 7;
const LOOP_R = 246; // orbit radius inside the 560 viewBox
const LOOP_C = 2 * Math.PI * LOOP_R;

const LOOP_STAGES = [
  {
    n: "01", t: "AUDIT", Ico: ScanSearch, short: "See what's working now.",
    head: ["Understand exactly", "what's working."],
    feats: [
      [BarChart3, "Analyzes content performance", "Identifies strengths and weaknesses."],
      [ScanSearch, "Finds hidden patterns", "Discovers what your best posts have in common."],
      [Target, "Creates your baseline", "Turns performance into a measurable strategy."],
    ],
  },
  {
    n: "02", t: "PLAN", Ico: CalendarDays, short: "Build your next strategy.",
    head: ["A weekly plan", "built on signal."],
    feats: [
      [Target, "Prioritizes opportunities", "Ranks what will move your account this week."],
      [CalendarDays, "Maps your calendar", "Puts formats and topics on the right days."],
      [Check, "Sets clear targets", "Every post gets a job to do."],
    ],
  },
  {
    n: "03", t: "CREATE", Ico: PenLine, short: "Create content that connects.",
    head: ["Make content", "that connects."],
    feats: [
      [PenLine, "Generates hooks and scripts", "Starts every post from a proven angle."],
      [Users, "Matches your voice", "Builds on your niche and your past winners."],
      [Sparkles, "Removes guesswork", "You create. SOCIA guides the shape."],
    ],
  },
  {
    n: "04", t: "SCORE", Ico: BarChart3, short: "Predict before you post.",
    head: ["Know the outcome", "before you post."],
    feats: [
      [Zap, "Predicts performance", "Scores hook, clarity, pacing, and retention."],
      [ScanSearch, "Flags weak points", "Shows exactly what to fix before publishing."],
      [Check, "Protects your average", "Weak posts get better. Strong posts ship."],
    ],
  },
  {
    n: "05", t: "PUBLISH", Ico: Send, short: "Post at the right moment.",
    head: ["Post during optimal", "audience windows."],
    feats: [
      [Clock, "Finds your best times", "Based on when your audience is most active."],
      [Target, "Matches content to moment", "Aligns your message with real-time opportunity."],
      [TrendingUp, "Increases probability of impact", "More reach. More engagement. More growth."],
    ],
  },
  {
    n: "06", t: "MEASURE", Ico: PieChart, short: "See what actually worked.",
    head: ["See what", "actually worked."],
    feats: [
      [PieChart, "Tracks real outcomes", "Reach, retention, saves, and follows. Not vanity."],
      [BarChart3, "Compares result to prediction", "Every post sharpens the next forecast."],
      [ScanSearch, "Surfaces the why", "Shows what actually drove the result."],
    ],
  },
  {
    n: "07", t: "LEARN", Ico: BookOpen, short: "Turn results into intelligence.",
    head: ["Every result makes", "SOCIA smarter."],
    feats: [
      [BookOpen, "Feeds results back", "Wins and misses update your strategy."],
      [TrendingUp, "Compounds your data", "Each cycle starts smarter than the last."],
      [Sparkles, "Improves recommendations", "Next week's plan is built on this week's proof."],
    ],
  },
] as const;

function Loop() {
  const [ref, inView] = useInView<HTMLDivElement>(0.22);
  const [stage, setStage] = useState(4); // logical selection: panel, strip, progress arc
  const [lit, setLit] = useState(4); // node currently lit (−1 while the signal travels)
  const [shown, setShown] = useState(4); // panel content on screen
  const [rot, setRot] = useState((4 / LOOP_N) * 360); // cumulative dot rotation, always forward
  const [travel, setTravel] = useState(false);
  const [pulse, setPulse] = useState(false);
  const stageRef = useRef(4);
  const busyRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const select = useCallback((j: number) => {
    const cur = stageRef.current;
    if (j === cur || busyRef.current) return;
    stageRef.current = j;
    setStage(j);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setLit(j);
      setShown(j);
      setRot((j / LOOP_N) * 360);
      return;
    }
    busyRef.current = true;
    setLit(-1);
    setTravel(true);
    setRot((r) => r + (((j - cur + LOOP_N) % LOOP_N) * 360) / LOOP_N);
    timers.current.push(setTimeout(() => setShown(j), 190));
    timers.current.push(
      setTimeout(() => {
        setLit(j);
        setTravel(false);
        setPulse(true);
        busyRef.current = false;
        timers.current.push(setTimeout(() => setPulse(false), 450));
      }, 640),
    );
  }, []);

  const S = LOOP_STAGES[shown];

  return (
    <div ref={ref} className={`so-loop2 ${inView ? "in" : ""}`}>
      <div className="so-lgrid">
        {/* the loop */}
        <div className="so-lring">
          <svg className="so-lorbit" viewBox="0 0 560 560" aria-hidden>
            <circle className="so-lorbit-base" cx="280" cy="280" r={LOOP_R} fill="none" />
            {Array.from({ length: LOOP_N }, (_, i) => {
              const a = ((i + 0.5) / LOOP_N) * Math.PI * 2 - Math.PI / 2;
              // Rounded: Node and the browser print long floats differently, and
              // the raw values reached the SSR markup as a hydration mismatch.
              const x = +(280 + LOOP_R * Math.cos(a)).toFixed(3);
              const y = +(280 + LOOP_R * Math.sin(a)).toFixed(3);
              const deg = +((a * 180) / Math.PI + 90).toFixed(3);
              return (
                <path
                  key={i}
                  className="so-larrow"
                  d="M-3.2,-2.5 L2.6,0 L-3.2,2.5"
                  transform={`translate(${x} ${y}) rotate(${deg})`}
                  fill="none"
                />
              );
            })}
            <circle
              className="so-lorbit-prog"
              cx="280" cy="280" r={LOOP_R} fill="none"
              strokeDasharray={`${(stage / LOOP_N) * LOOP_C} ${LOOP_C}`}
              transform="rotate(-90 280 280)"
            />
            <g className={`so-ldot ${travel ? "go" : ""}`} style={{ transform: `rotate(${rot}deg)` }}>
              <circle cx="280" cy={280 - LOOP_R} r="4.5" />
            </g>
          </svg>

          <div className={`so-lcore ${pulse ? "pulse" : ""}`}><BrandMark size={22} /> SOCIA</div>

          {LOOP_STAGES.map((s, i) => {
            const a = (i / LOOP_N) * Math.PI * 2 - Math.PI / 2;
            const x = +(50 + 44 * Math.cos(a)).toFixed(3);
            const y = +(50 + 44 * Math.sin(a)).toFixed(3);
            return (
              <button
                key={s.t}
                type="button"
                className={`so-lnode ${lit === i ? "on" : ""}`}
                style={{ left: `${x}%`, top: `${y}%`, "--d": `${0.5 + i * 0.05}s` } as React.CSSProperties}
                onClick={() => select(i)}
                aria-pressed={lit === i}
              >
                <span className="so-lnode-c"><s.Ico size={16} /></span>
                <b>{s.t}</b>
                <small>{s.short}</small>
              </button>
            );
          })}

          <span className="so-llink" key={stage} aria-hidden />
        </div>

        {/* active stage */}
        <div className="so-lpanel">
          <span className="so-lpanel-num">{LOOP_STAGES[stage].n}</span>
          <div className={`so-lpanel-body ${shown !== stage ? "out" : ""}`} key={shown}>
            <h3>{S.t}<i /></h3>
            <p className="so-lpanel-lead">{S.head[0]}<br />{S.head[1]}</p>
            <small className="so-lpanel-label">WHAT SOCIA DOES</small>
            <div className="so-lfeats">
              {S.feats.map(([Fi, t, d]) => (
                <div key={t} className="so-lfeat">
                  <span className="so-lfeat-ico"><Fi size={15} /></span>
                  <div><b>{t}</b><span>{d}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* compounding strip */}
      <div className="so-lstrip">
        <div className="so-lgraph" aria-hidden>
          <svg viewBox="0 0 150 56" preserveAspectRatio="none">
            <path className="so-lgarea" d="M4,50 L18,44 L30,47 L44,38 L58,42 L72,30 L86,34 L100,22 L114,26 L132,12 L146,8 L146,54 L4,54 Z" />
            <path className="so-lgline" d="M4,50 L18,44 L30,47 L44,38 L58,42 L72,30 L86,34 L100,22 L114,26 L132,12 L146,8" fill="none" />
          </svg>
          <span className="so-lgchip">+32%</span>
        </div>
        <div className="so-lstrip-copy">
          <b>The more you post, the smarter SOCIA gets.</b>
          <small>Every cycle gives SOCIA more signal. Better signals create better decisions.</small>
        </div>
        <span className="so-lseq">
          {LOOP_STAGES.map((s, i) => (
            <em key={s.t} className={stage === i ? "on" : ""}>
              <button type="button" onClick={() => select(i)}>{s.t}</button>
              {i < LOOP_N - 1 && <ArrowRight size={9} />}
            </em>
          ))}
        </span>
      </div>
    </div>
  );
}

/* ---------------- FAQ ---------------- */

const FAQS = [
  { q: "How does the free audit work?", a: "You connect your account and SOCIA reads it: your posts, your engagement, your niche. In under a minute you get an account health score, content opportunities, a performance breakdown, and top recommendations." },
  { q: "What platforms does SOCIA support?", a: "Instagram connects live today with real profile and post data. TikTok and YouTube register now and sync as each platform approves API access." },
  { q: "Does SOCIA create content?", a: "It plans and drafts: weekly strategies, post concepts, hooks, and scripts. You stay the voice. SOCIA does the thinking that comes before filming." },
  { q: "Can SOCIA predict whether content will perform?", a: "It scores every idea on hook, retention, relevance, and originality against what your audience already responds to. A score is a forecast, not a promise, and SOCIA is honest about that." },
  { q: "Does SOCIA replace a social media manager?", a: "For solo creators, it covers the strategy work a manager would do. For teams and agencies, it makes the manager faster: audits, plans, and scoring in minutes instead of afternoons." },
  { q: "How does SOCIA use my data?", a: "Your synced account data is used to build your dashboard and your plans. It stays yours, it isn't sold, and you can disconnect and delete it anytime." },
  { q: "Can I cancel anytime?", a: "Yes. Paid plans start with 7 days free, and you can cancel in one click before or after the trial ends." },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="so-faq">
      {FAQS.map((f, i) => (
        <div key={i} className={`so-faq-item ${open === i ? "open" : ""}`}>
          <button className="so-faq-q" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            {f.q}
            <Plus size={17} className="so-faq-plus" />
          </button>
          <div className="so-faq-a"><p>{f.a}</p></div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- main ---------------- */

export default function CinematicLanding() {
  const [active, setActive] = useState(0);
  const [menu, setMenu] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const [cursorLabel, setCursorLabel] = useState("");

  const theme = CHAPTERS[active].theme;
  const fieldMode = theme;

  /* chapter tracking */
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = CHAPTERS.findIndex((c) => c.id === e.target.id);
            if (idx >= 0) setActive(idx);
          }
        }
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    CHAPTERS.forEach((c) => {
      const el = document.getElementById(c.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  /* hero scroll parallax */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const nav = document.querySelector(".so-nav");
    const tick = () => {
      const el = heroRef.current;
      if (el) {
        const p = Math.min(1.4, window.scrollY / window.innerHeight);
        el.style.setProperty("--p", String(p));
      }
      if (nav) nav.classList.toggle("compact", window.scrollY > 40);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* custom cursor (fine pointers only) */
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const cur = cursorRef.current;
    if (!cur) return;
    document.documentElement.classList.add("so-has-cursor");
    let x = -100, y = -100, tx = -100, ty = -100, raf = 0;
    const move = (e: MouseEvent) => {
      tx = e.clientX; ty = e.clientY;
      const t = (e.target as HTMLElement).closest("[data-cursor]");
      setCursorLabel(t ? (t as HTMLElement).dataset.cursor || "" : "");
    };
    const tick = () => {
      x += (tx - x) * 0.22;
      y += (ty - y) * 0.22;
      cur.style.transform = `translate(${x}px, ${y}px)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", move);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", move);
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove("so-has-cursor");
    };
  }, []);

  const jump = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenu(false);
  }, []);

  return (
    <div className={`so so-theme-${theme}`}>
      <IntelligenceField mode={fieldMode} />
      <div className="so-vignette" aria-hidden />
      <div ref={cursorRef} className={`so-cursor ${cursorLabel ? "big" : ""}`} aria-hidden>
        {cursorLabel && <em>{cursorLabel}</em>}
      </div>

      {/* nav */}
      <header className={`so-nav ${theme !== "light" ? "on-dark" : "on-light"}`}>
        <Link href="/" className="so-brand"><BrandMark size={26} /> SOCIA</Link>
        <nav className="so-nav-links" aria-label="Sections">
          <button onClick={() => jump("engine")}>Product</button>
          <button onClick={() => jump("ask")}>Strategist</button>
          <button onClick={() => jump("loop")}>How It Works</button>
          <button onClick={() => jump("results")}>Results</button>
          <button onClick={() => jump("pricing")}>Pricing</button>
        </nav>
        <div className="so-nav-right">
          <Link href="/login" className="so-login">Log In</Link>
          <Link href="/signup" className="so-btn so-btn-blue sm">Start Free Audit <ArrowRight size={14} /></Link>
          <button className="so-menu-btn" onClick={() => setMenu(!menu)} aria-label="Menu">
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>
      {menu && (
        <div className="so-mobile-menu">
          {[["engine", "Product"], ["ask", "Strategist"], ["loop", "How It Works"], ["results", "Results"], ["pricing", "Pricing"]].map(([id, l]) => (
            <button key={id} onClick={() => jump(id)}>{l}</button>
          ))}
          <Link href="/login">Log In</Link>
          <Link href="/signup" className="so-btn so-btn-blue">Start Free Audit <ArrowRight size={15} /></Link>
        </div>
      )}

      {/* chapter rail */}
      <aside className="so-rail" aria-hidden>
        {CHAPTERS.map((c, i) => (
          <button key={c.id} className={i === active ? "on" : ""} onClick={() => jump(c.id)}>
            <i>{String(i + 1).padStart(2, "0")}</i>
            <span>{c.label}</span>
          </button>
        ))}
      </aside>

      {/* ================= 01 PROMISE ================= */}
      <section id="promise" ref={heroRef} className="so-ch so-hero">
        <div className="so-hgrid">
          <div className="so-hleft">
            <Rise><span className="so-label">AI SOCIAL INTELLIGENCE</span></Rise>
            <h1>
              <Words text="Know what to post" />
              <br />
              <span className="so-blue"><Words text="before you post it." /></span>
            </h1>
            <Rise delay={320}>
              <p className="so-hero-sub">
                SOCIA studies your content, audience, competitors, and performance. Then it
                tells you what to post, why it should work, and when to publish.
              </p>
            </Rise>
            <Rise delay={420}>
              <div className="so-hero-ctas">
                <Link href="/signup" className="so-btn so-btn-blue" data-cursor="AUDIT">
                  Start Free Audit <ArrowRight size={15} />
                </Link>
                <button className="so-btn so-btn-ghost play" onClick={() => jump("engine")} data-cursor="VIEW">
                  <span className="so-play"><Play size={10} fill="currentColor" /></span> See How It Works
                </button>
              </div>
              <span className="so-micro">No credit card · Audit in under 60 seconds</span>
            </Rise>
          </div>

          {/* dimensional product interface */}
          <div className="so-hright" data-cursor="EXPLORE">
            <div className="so-dash">
              <div className="so-dash-head">
                <BrandMark size={18} /> <b>SOCIA</b>
                <span className="so-dash-live"><i /> Live</span>
                <span className="so-dash-updated">Last updated 2 min ago</span>
              </div>
              <div className="so-dash-body">
                <aside className="so-dash-side" aria-hidden>
                  {[
                    ["Overview", LayoutDashboard, true],
                    ["Strategist", Sparkles, false],
                    ["Content", FileText, false],
                    ["Analytics", BarChart3, false],
                    ["Competitors", Radar, false],
                    ["Calendar", CalendarDays, false],
                    ["Settings", Settings, false],
                  ].map(([label, Icon, on]) => {
                    const I = Icon as typeof LayoutDashboard;
                    return (
                      <span key={label as string} className={on ? "on" : ""}>
                        <I size={11} /> {label as string}
                      </span>
                    );
                  })}
                </aside>
                <div className="so-dash-main">
                  <div className="so-dash-row1">
                    <small>CONTENT PERFORMANCE</small>
                    <span className="so-dash-chip">Last 7 days</span>
                  </div>
                  <div className="so-dash-mid">
                    <div className="so-radial">
                      <svg viewBox="0 0 84 84" aria-hidden>
                        <defs>
                          <linearGradient id="soring" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#4c86ff" />
                            <stop offset="100%" stopColor="#60a5fa" />
                          </linearGradient>
                        </defs>
                        <circle cx="42" cy="42" r="34" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
                        <circle className="so-ring-fill" cx="42" cy="42" r="34" fill="none" stroke="url(#soring)" strokeWidth="7" strokeLinecap="round" strokeDasharray="213.6" transform="rotate(-90 42 42)" />
                      </svg>
                      <span className="so-radial-num"><Num value={92} /><small>HEALTH</small></span>
                    </div>
                    <div className="so-dash-stats">
                      <div><span>Engagement</span><b className="up">+18.6%</b></div>
                      <div><span>Reach</span><b className="up">+24.3%</b></div>
                      <div><span>Followers</span><b className="up">+12.7%</b></div>
                    </div>
                  </div>
                  <div className="so-dash-chartwrap">
                    <span className="so-chart-chip">+18.6%</span>
                    <svg className="so-dash-chart" viewBox="0 0 320 70" preserveAspectRatio="none" aria-hidden>
                      <defs>
                        <linearGradient id="soga" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563ff" stopOpacity="0.30" />
                          <stop offset="100%" stopColor="#2563ff" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path className="so-chart-area" d="M0,56 L46,50 L92,53 L138,42 L184,46 L230,32 L276,24 L320,12 L320,70 L0,70 Z" fill="url(#soga)" />
                      <path className="so-chart-line" d="M0,56 L46,50 L92,53 L138,42 L184,46 L230,32 L276,24 L320,12" fill="none" stroke="#60a5fa" strokeWidth="2" />
                    </svg>
                    <div className="so-dash-days">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                        <span key={d}>{d}</span>
                      ))}
                    </div>
                  </div>
                  <div className="so-dash-bottom">
                    <div className="so-dash-panel">
                      <small>BEST POSTING WINDOW</small>
                      <b>Thursday · 6:40 PM</b>
                      <div className="so-winbars" aria-hidden>
                        {[34, 48, 40, 88, 56, 44, 30].map((h, i) => (
                          <i key={i} className={i === 3 ? "hot" : ""} style={{ height: `${h}%` }} />
                        ))}
                      </div>
                    </div>
                    <div className="so-dash-panel">
                      <small>CONTENT OPPORTUNITIES</small>
                      <b>3 detected</b>
                      <span className="so-dash-link">View insights <ArrowRight size={11} /></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="so-fcard f1">
              <small>COMPETITOR MOVEMENT</small>
              <b className="up">+24%</b>
              <svg viewBox="0 0 90 26" preserveAspectRatio="none" aria-hidden>
                <path d="M0,20 L15,16 L30,18 L45,10 L60,13 L75,6 L90,3" fill="none" stroke="#4c86ff" strokeWidth="2" />
              </svg>
            </div>
            <div className="so-fcard f2">
              <span className="so-fcard-ico"><Sparkles size={13} /></span>
              <div>
                <small>AI RECOMMENDATION</small>
                <b>Post a behind-the-scenes video.</b>
                <span>It&apos;s performing well for your top competitors.</span>
              </div>
              <ArrowRight size={14} className="so-fcard-arrow" />
            </div>
          </div>
        </div>

        {/* data landscape */}
        <div className="so-terrain" aria-hidden>
          <svg viewBox="0 0 1440 220" preserveAspectRatio="none">
            <defs>
              <linearGradient id="soterr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563ff" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#2563ff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0,150 L110,118 L230,142 L350,96 L470,128 L590,86 L710,120 L830,78 L950,112 L1070,70 L1190,104 L1310,64 L1440,92 L1440,220 L0,220 Z" fill="url(#soterr)" />
            <path d="M0,150 L110,118 L230,142 L350,96 L470,128 L590,86 L710,120 L830,78 L950,112 L1070,70 L1190,104 L1310,64 L1440,92" fill="none" stroke="rgba(76,134,255,0.30)" strokeWidth="1.2" />
            <path d="M0,190 L140,168 L280,184 L420,152 L560,176 L700,146 L840,170 L980,140 L1120,162 L1260,132 L1440,150" fill="none" stroke="rgba(76,134,255,0.14)" strokeWidth="1" />
            <circle className="so-tnode" cx="350" cy="96" r="3" />
            <circle className="so-tnode d2" cx="830" cy="78" r="3" />
            <circle className="so-tnode d3" cx="1190" cy="104" r="3" />
            <circle cx="590" cy="86" r="2" fill="rgba(139,176,255,0.5)" />
            <circle cx="1070" cy="70" r="2" fill="rgba(139,176,255,0.5)" />
          </svg>
        </div>

        {/* proof band */}
        <div className="so-proof">
          <small>TRUSTED BY CREATORS &amp; TEAMS</small>
          <div className="so-prooflogos">
            {["northloop", "Verve", "STUDIO/9", "Hatch&Co", "Meridian", "bloomtide"].map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
          <div className="so-proofstats">
            <div><span className="so-proof-ico"><Zap size={16} /></span><b><Num value={3.2} suffix="×" /></b><span>more engagement</span></div>
            <div><span className="so-proof-ico"><Clock size={16} /></span><b><Num value={6} suffix="hrs" /></b><span>saved per week</span></div>
            <div><span className="so-proof-ico"><Target size={16} /></span><b><Num value={92} suffix="%" /></b><span>score-to-hit rate</span></div>
            <div><span className="so-proof-ico"><Users size={16} /></span><b><Num value={40} suffix="k+" /></b><span>accounts audited</span></div>
          </div>
        </div>
      </section>

      {/* ================= 02 PROBLEM ================= */}
      <section id="problem" className="so-ch so-problem">
        <div className="so-wrap">
          <Rise><span className="so-label">02 PROBLEM</span></Rise>
          <h2 className="so-h2">
            <Words text="Posting shouldn’t" />
            <br />
            <Words text="be guesswork." />
          </h2>
          <Rise delay={120}>
            <p className="so-lead">
              Creators produce more content than ever, but most still make decisions using
              instinct, outdated analytics, and whatever happened to work last week.
            </p>
          </Rise>
          <Rise delay={200}>
            <p className="so-prob-emph"><span className="so-blue">SOCIA</span> turns those signals into decisions.</p>
          </Rise>

          <div className="so-probgrid">
            {/* NO CLEAR STRATEGY */}
            <Rise className="so-pcard-w">
              <div className="so-pcard">
                <div className="so-pcard-head"><span className="so-pcard-ico"><CalendarDays size={14} /></span> NO CLEAR STRATEGY</div>
                <div className="so-pcard-cols">
                  <div className="so-pcard-copy">
                    <p>Posting without a plan creates inconsistent results.</p>
                    <small className="so-mlabel">POSTING CONSISTENCY</small>
                    <b className="so-mval">42%</b>
                    <span className="so-mbar"><em style={{ width: "42%" }} /></span>
                  </div>
                  <div className="so-weekdots" aria-label="Posting activity, four weeks">
                    {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                      <span key={i} className="so-wd-day">{d}</span>
                    ))}
                    {[
                      [0, 0, 2, 0, 0, 0, 1],
                      [0, 1, 0, 0, 1, 0, 1],
                      [1, 0, 1, 0, 0, 1, 0],
                      [1, 0, 0, 1, 0, 1, 0],
                    ].map((week, w) =>
                      week.map((n, d) => (
                        <span key={`${w}-${d}`} className={`so-dot n${n}`} tabIndex={-1}>
                          <i className="so-tip">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d]} · {n} {n === 1 ? "post" : "posts"}</i>
                        </span>
                      )),
                    )}
                  </div>
                </div>
              </div>
            </Rise>

            {/* WRONG CONTENT */}
            <Rise delay={80} className="so-pcard-w">
              <div className="so-pcard">
                <div className="so-pcard-head"><span className="so-pcard-ico"><Play size={13} /></span> WRONG CONTENT</div>
                <div className="so-pcard-cols">
                  <div className="so-pcard-copy">
                    <p>Guessing what works wastes time and reach.</p>
                    <small className="so-mlabel">CONTENT FIT</small>
                    <b className="so-mval low">LOW</b>
                    <span className="so-mbar low"><em style={{ width: "18%" }} /></span>
                  </div>
                  <div className="so-thumbs">
                    {[
                      { views: "4.2K", eng: "0.8%", g: "g1", win: false },
                      { views: "6.1K", eng: "1.1%", g: "g2", win: false },
                      { views: "28.7K", eng: "4.6%", g: "g3", win: true },
                      { views: "3.3K", eng: "0.6%", g: "g4", win: false },
                    ].map((t, i) => (
                      <div key={i} className={`so-thumb ${t.win ? "win" : ""}`}>
                        <span className={`so-thumb-media ${t.g}`}>
                          <Play size={12} fill="currentColor" />
                          {t.win && <i className="so-thumb-check"><Check size={9} strokeWidth={3.5} /></i>}
                        </span>
                        <b>{t.views}</b>
                        <small>views</small>
                        <b className={t.win ? "so-blue" : ""}>{t.eng}</b>
                        <small>engagement</small>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Rise>

            {/* MISSED OPPORTUNITIES */}
            <Rise delay={140} className="so-pcard-w">
              <div className="so-pcard">
                <div className="so-pcard-head"><span className="so-pcard-ico"><TrendingUp size={14} /></span> MISSED OPPORTUNITIES</div>
                <div className="so-pcard-cols chart">
                  <div className="so-pcard-copy">
                    <p>Winning formats and topics are often visible before creators notice them.</p>
                  </div>
                  <div className="so-chartbox">
                    <div className="so-anno">
                      <small>EDUCATIONAL REELS</small>
                      <b>+68%</b>
                      <span>niche momentum</span>
                      <em>Opportunity missed</em>
                    </div>
                    <svg viewBox="0 0 340 130" preserveAspectRatio="none" aria-hidden>
                      <defs>
                        <linearGradient id="sopm" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563ff" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#2563ff" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {[0, 25, 50, 75, 100].map((v) => (
                        <g key={v}>
                          <text x="26" y={112 - v * 0.96} textAnchor="end" fontSize="7" fill="#5c6474">{v}</text>
                          <line x1="34" y1={108 - v * 0.96} x2="330" y2={108 - v * 0.96} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                        </g>
                      ))}
                      <path className="so-draw a" d="M36,100 L66,98 L96,99 L126,95 L156,94 L186,90 L216,83 L246,71 L276,55 L306,43 L330,33 L330,108 L36,108 Z" fill="url(#sopm)" stroke="none" />
                      <path className="so-draw l" d="M36,100 L66,98 L96,99 L126,95 L156,94 L186,90 L216,83 L246,71 L276,55 L306,43 L330,33" fill="none" stroke="#4c86ff" strokeWidth="2" />
                      <line x1="276" y1="55" x2="276" y2="108" stroke="rgba(76,134,255,0.4)" strokeWidth="1" strokeDasharray="3 3" />
                      {[[36, 100, 8], [126, 95, 13], [216, 83, 26], [276, 55, 55], [330, 33, 78]].map(([x, y, v]) => (
                        <circle key={x} className={x === 276 ? "so-pt hot" : "so-pt"} cx={x} cy={y} r={x === 276 ? 4 : 2.5}>
                          <title>{`+${v}% momentum`}</title>
                        </circle>
                      ))}
                    </svg>
                    <div className="so-xaxis">
                      {["APR 1", "APR 8", "APR 15", "APR 22", "APR 29"].map((d) => <span key={d}>{d}</span>)}
                    </div>
                  </div>
                </div>
              </div>
            </Rise>

            {/* FALLING BEHIND */}
            <Rise delay={200} className="so-pcard-w">
              <div className="so-pcard">
                <div className="so-pcard-head"><span className="so-pcard-ico"><Users size={14} /></span> FALLING BEHIND</div>
                <div className="so-pcard-cols chart">
                  <div className="so-pcard-copy">
                    <p>Competitors learn faster while you&apos;re still interpreting yesterday&apos;s analytics.</p>
                    <span className="so-outlier"><Radar size={12} /> 2 OUTLIER POSTS DETECTED</span>
                  </div>
                  <div className="so-chartbox">
                    <div className="so-legend">
                      <span><i className="ca" /> Competitor A</span>
                      <span><i className="cb" /> Competitor B</span>
                      <span><i className="cy" /> Your account</span>
                    </div>
                    <div className="so-endlabels">
                      <b className="ca">+31%</b>
                      <b className="cb">+24%</b>
                      <b className="cy">+3%</b>
                    </div>
                    <svg viewBox="0 0 340 120" preserveAspectRatio="none" aria-hidden>
                      <path className="so-draw l" d="M20,96 L70,88 L120,74 L170,58 L220,44 L270,30 L330,18" fill="none" stroke="#48c78e" strokeWidth="2" />
                      <path className="so-draw l d2" d="M20,98 L70,92 L120,84 L170,72 L220,60 L270,50 L330,40" fill="none" stroke="#a78bfa" strokeWidth="2" />
                      <path className="so-draw l d3" d="M20,100 L70,98 L120,97 L170,95 L220,94 L270,92 L330,90" fill="none" stroke="#4c86ff" strokeWidth="2" />
                      {[[20, 96], [120, 74], [220, 44], [330, 18]].map(([x, y]) => (
                        <circle key={`a${x}`} className="so-pt ga" cx={x} cy={y} r="2.5"><title>Competitor A</title></circle>
                      ))}
                      {[[20, 98], [120, 84], [220, 60], [330, 40]].map(([x, y]) => (
                        <circle key={`b${x}`} className="so-pt gb" cx={x} cy={y} r="2.5"><title>Competitor B</title></circle>
                      ))}
                      {[[20, 100], [120, 97], [220, 94], [330, 90]].map(([x, y]) => (
                        <circle key={`y${x}`} className="so-pt gy" cx={x} cy={y} r="2.5"><title>Your account</title></circle>
                      ))}
                    </svg>
                    <div className="so-xaxis three">
                      {["APR 1", "APR 15", "APR 29"].map((d) => <span key={d}>{d}</span>)}
                    </div>
                  </div>
                </div>
              </div>
            </Rise>
          </div>

          {/* intelligence strip */}
          <Rise delay={200}>
            <div className="so-strip">
              <span className="so-strip-ico"><ScanSearch size={18} /></span>
              <div className="so-strip-copy">
                <b>SOCIA connects the dots others miss.</b>
                <span>From scattered signals to smart, confident decisions.</span>
              </div>
              <svg className="so-strip-sig" viewBox="0 0 520 80" preserveAspectRatio="xMidYMid meet" aria-hidden>
                <path className="so-sig" d="M0,12 C120,12 200,38 320,40" fill="none" stroke="rgba(76,134,255,0.35)" strokeWidth="1" />
                <path className="so-sig s2" d="M0,28 C110,26 210,39 320,40" fill="none" stroke="rgba(76,134,255,0.3)" strokeWidth="1" />
                <path className="so-sig s3" d="M0,44 C120,46 200,41 320,40" fill="none" stroke="rgba(76,134,255,0.3)" strokeWidth="1" />
                <path className="so-sig s4" d="M0,60 C130,62 210,42 320,40" fill="none" stroke="rgba(76,134,255,0.35)" strokeWidth="1" />
                <path className="so-sig s5" d="M0,74 C140,74 220,44 320,40" fill="none" stroke="rgba(76,134,255,0.25)" strokeWidth="1" />
                <path className="so-sig main" d="M320,40 L508,40" fill="none" stroke="#4c86ff" strokeWidth="2" />
                <circle className="so-sig-node" cx="320" cy="40" r="3.5" fill="#4c86ff" />
                <circle cx="508" cy="40" r="2.5" fill="#8bb0ff" />
              </svg>
            </div>
          </Rise>
        </div>
      </section>

      {/* ================= 03 ENGINE ================= */}
      <section id="engine" className="so-ch so-engine">
        <div className="so-wrap">
          {/* faint intelligence field behind the composition */}
          <svg className="so-eng-field" viewBox="0 0 1200 900" preserveAspectRatio="none" aria-hidden>
            <path d="M-20,540 C300,490 720,430 1230,150" fill="none" stroke="rgba(37,99,255,0.07)" strokeWidth="1" />
            <path d="M-20,640 C340,600 780,530 1230,270" fill="none" stroke="rgba(37,99,255,0.055)" strokeWidth="1" />
            <path d="M380,40 C700,110 960,210 1230,400" fill="none" stroke="rgba(37,99,255,0.05)" strokeWidth="1" />
            <circle cx="985" cy="238" r="2.2" fill="rgba(37,99,255,0.32)" />
            <circle cx="1105" cy="196" r="2" fill="rgba(37,99,255,0.26)" />
            <circle cx="880" cy="452" r="2.2" fill="rgba(37,99,255,0.3)" />
            <circle cx="1150" cy="330" r="1.8" fill="rgba(37,99,255,0.22)" />
          </svg>
          <div className="so-eng-head">
            <Rise><span className="so-eng-eyebrow"><i /><b>THE SOCIA</b> INTELLIGENCE ENGINE</span></Rise>
            <h2 className="so-h2 dark">
              <Words text="Everything from audit" />
              <br />
              <span className="so-blue"><Words text="to your next move." /></span>
            </h2>
            <Rise delay={120}>
              <p className="so-lead dark">
                SOCIA watches your content, competitors, audience, and performance. Then it
                turns those signals into the next thing you should do.
              </p>
            </Rise>
          </div>

          <div className="so-eng-grid">
            {/* intelligence paths */}
            <svg className="so-epaths" viewBox="0 0 1200 660" preserveAspectRatio="none" aria-hidden>
              <path className="so-epath p-audit" d="M560,180 C660,180 700,220 790,240" />
              <path className="so-epath p-comp" d="M770,150 C800,150 810,170 830,190" />
              <path className="so-epath p-scorer" d="M480,520 C640,520 700,420 800,380" />
              <path className="so-epath p-sched" d="M740,540 C780,530 800,470 815,420" />
              <circle className="so-enode n1" cx="790" cy="240" r="3.5" />
              <circle className="so-enode n2" cx="830" cy="190" r="3.5" />
              <circle className="so-enode n3" cx="800" cy="380" r="3.5" />
            </svg>

            {/* CONTENT AUDIT */}
            <Rise className="so-eng-area e-audit">
              <div className="so-ecard" data-cursor="VIEW">
                <div className="so-ecard-head">
                  <span className="so-ecard-ico"><ScanSearch size={13} /></span> CONTENT AUDIT
                  <span className="so-echip up">+12 vs last week</span>
                </div>
                <div className="so-audit-flex">
                  <div className="so-audit-left">
                    <small className="so-mlabel dark">ACCOUNT HEALTH</small>
                    <div className="so-audit-big"><b>92</b><span>/ 100</span></div>
                    <div className="so-radial light">
                      <svg viewBox="0 0 84 84" aria-hidden>
                        <defs>
                          <linearGradient id="soring3" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#2563ff" />
                            <stop offset="100%" stopColor="#60a5fa" />
                          </linearGradient>
                        </defs>
                        <circle cx="42" cy="42" r="34" fill="none" stroke="rgba(15,17,21,0.08)" strokeWidth="7" />
                        <circle className="so-ring-fill" cx="42" cy="42" r="34" fill="none" stroke="url(#soring3)" strokeWidth="7" strokeLinecap="round" strokeDasharray="213.6" transform="rotate(-90 42 42)" />
                      </svg>
                      <span className="so-radial-num dark">92</span>
                    </div>
                    <b className="so-audit-state">Strong</b>
                    <span className="so-audit-note">Keep momentum going.</span>
                  </div>
                  <div className="so-audit-bars">
                    {[["Hook strength", 91], ["Posting consistency", 84], ["Topic concentration", 76], ["Engagement efficiency", 88], ["Content diversity", 71]].map(([l, v]) => (
                      <div key={l as string} className="so-abar" title={`${l}: ${v}/100`}>
                        <span>{l}</span><i><em style={{ width: `${v}%` }} /></i><b>{v}</b>
                      </div>
                    ))}
                  </div>
                </div>
                <Link href="/signup" className="so-b-cta">View full audit <ArrowRight size={13} /></Link>
              </div>
            </Rise>

            {/* COMPETITOR INTELLIGENCE */}
            <Rise delay={120} className="so-eng-area e-comp">
              <div className="so-ecard" data-cursor="VIEW">
                <div className="so-ecard-head"><span className="so-ecard-ico"><Radar size={13} /></span> COMPETITOR INTELLIGENCE</div>
                <div className="so-crows">
                  <div className="so-crow">
                    <i>A</i>
                    <div><b>Competitor A</b><span className="up">+31% momentum</span></div>
                    <svg viewBox="0 0 84 22" preserveAspectRatio="none"><path className="so-spark" d="M0,18 L14,15 L28,16 L42,11 L56,8 L70,6 L84,2" fill="none" stroke="#16a34a" strokeWidth="1.6" /></svg>
                  </div>
                  <div className="so-crow">
                    <i>B</i>
                    <div><b>Competitor B</b><span>2 outlier posts detected</span></div>
                    <svg viewBox="0 0 84 22" preserveAspectRatio="none"><path className="so-spark" d="M0,14 L14,16 L28,7 L42,15 L56,4 L70,13 L84,10" fill="none" stroke="#a78bfa" strokeWidth="1.6" /></svg>
                  </div>
                  <div className="so-crow">
                    <i>C</i>
                    <div><b>Competitor C</b><span>Educational Reels gaining traction</span></div>
                    <svg viewBox="0 0 84 22" preserveAspectRatio="none"><path className="so-spark" d="M0,17 L14,16 L28,14 L42,14 L56,10 L70,9 L84,6" fill="none" stroke="#2563ff" strokeWidth="1.6" /></svg>
                  </div>
                </div>
                <Link href="/signup" className="so-b-cta">Scan competitors <ArrowRight size={13} /></Link>
              </div>
            </Rise>

            {/* RECOMMENDATION ENGINE */}
            <Rise delay={550} className="so-eng-area e-rec">
              <div className="so-ecard rec" data-cursor="VIEW">
                <div className="so-ecard-head"><span className="so-ecard-ico"><TrendingUp size={13} /></span> RECOMMENDATION ENGINE</div>
                <span className="so-rec-tag">HIGH IMPACT</span>
                <h3>Publish another educational Reel this week.</h3>
                <p className="so-rec-why"><b>Why?</b> Your educational videos are generating 2.4× your average engagement.</p>
                <div className="so-predictbox" title="Projected from your last 30 posts">
                  <div>
                    <small>PREDICTED PERFORMANCE</small>
                    <b>+<Num value={31} suffix="%" duration={900} /></b>
                    <span>above baseline</span>
                  </div>
                  <svg viewBox="0 0 120 54" preserveAspectRatio="none" aria-hidden>
                    <path className="so-draw l" d="M4,48 L22,44 L40,45 L58,38 L76,30 L94,20 L116,8" fill="none" stroke="#2563ff" strokeWidth="2" />
                    {[[4, 48], [40, 45], [76, 30], [116, 8]].map(([x, y]) => (
                      <circle key={x} cx={x} cy={y} r="2.4" fill="#2563ff" />
                    ))}
                  </svg>
                </div>
                <div className="so-reasons">
                  {([
                    ["Hook demand", "Strong", TrendingUp],
                    ["Audience interest", "Rising", Users],
                    ["Timing", "Optimal", Clock],
                    ["Competitor saturation", "Low", Radar],
                  ] as const).map(([l, v, Ico]) => (
                    <div key={l}>
                      <span className="so-reason-l"><i><Ico size={12} /></i>{l}</span>
                      <b className="up">{v}</b>
                    </div>
                  ))}
                </div>
                <Link href="/signup" className="so-b-cta">See all recommendations <ArrowRight size={13} /></Link>
              </div>
            </Rise>

            {/* VIDEO SCORER */}
            <Rise delay={200} className="so-eng-area e-scorer">
              <div className="so-ecard" data-cursor="PLAY">
                <div className="so-ecard-head">
                  <span className="so-ecard-ico"><Video size={13} /></span> VIDEO SCORER
                  <span className="so-vplay" aria-hidden><Play size={10} fill="currentColor" /></span>
                </div>
                <div className="so-vsgrid">
                  {[["HOOK", 91, "How well the first seconds stop the scroll"], ["RETENTION", 78, "How much of the video people watch"], ["CLARITY", 86, "How easy the message is to follow"], ["PACING", 74, "How well the edit holds attention"]].map(([l, v, t]) => (
                    <div key={l as string} title={t as string}><small>{l}</small><b>{v}</b></div>
                  ))}
                  <div className="so-vsradial" title="Overall score">
                    <small>OVERALL</small>
                    <div className="so-vsring">
                      <svg viewBox="0 0 84 84" aria-hidden>
                        <circle cx="42" cy="42" r="34" fill="none" stroke="rgba(15,17,21,0.08)" strokeWidth="7" />
                        <circle className="so-ring-fill r84" cx="42" cy="42" r="34" fill="none" stroke="#2563ff" strokeWidth="7" strokeLinecap="round" strokeDasharray="213.6" transform="rotate(-90 42 42)" />
                      </svg>
                      <span className="so-radial-num dark sm">84</span>
                    </div>
                  </div>
                  <div title="Projected retention lift after fixes"><small>PREDICTED RETENTION</small><b className="up">+17%</b></div>
                </div>
                <Link href="/signup" className="so-b-cta">Improve video <ArrowRight size={13} /></Link>
              </div>
            </Rise>

            {/* SMART SCHEDULING */}
            <Rise delay={280} className="so-eng-area e-sched">
              <div className="so-ecard" data-cursor="VIEW">
                <div className="so-ecard-head"><span className="so-ecard-ico"><CalendarDays size={13} /></span> SMART SCHEDULING</div>
                <div className="so-sweek">
                  {[["M", "", ""], ["T", "6:20", "PM"], ["W", "", ""], ["T", "6:40", "PM"], ["F", "", ""], ["S", "11:15", "AM"], ["S", "", ""]].map(([d, t, m], i) => (
                    <div key={i} className="so-sdaycol">
                      <span className="so-sday-l">{d}</span>
                      <div className={`so-scell ${t ? "hot" : ""}`} title={t ? `Recommended: ${t} ${m}` : "No strong window"}>
                        {t ? (
                          <>
                            <b>{t}</b>
                            <small>{m}</small>
                            <em>★</em>
                          </>
                        ) : (
                          <span>–</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="so-sweek-note"><Clock size={12} /> Optimal time · 6:40 PM · Audience peak</p>
                <Link href="/signup" className="so-b-cta">View calendar <ArrowRight size={13} /></Link>
              </div>
            </Rise>
          </div>

          {/* one system strip */}
          <Rise delay={300}>
            <div className="so-onestrip">
              <span className="so-onestrip-ico"><Sparkles size={17} /></span>
              <div className="so-onestrip-copy">
                <b>One system. Smarter every week.</b>
                <small>More signals. Better decisions. Bigger results.</small>
              </div>
              <span className="so-oneseq">
                {["AUDIT", "PLAN", "CREATE", "SCORE", "PUBLISH", "MEASURE", "LEARN"].map((s, i) => (
                  <em key={s} className={s === "PUBLISH" ? "on" : ""}><b>{s}</b>{i < 6 && <ArrowRight size={9} />}</em>
                ))}
              </span>
              <svg className="so-onebars" viewBox="0 0 104 36" aria-hidden>
                {[9, 12, 11, 15, 18, 17, 22, 26, 29, 33].map((h, i) => (
                  <rect key={i} x={i * 10.5} y={36 - h} width="6.5" height={h} rx="2" className={i >= 8 ? "hi" : ""} />
                ))}
              </svg>
            </div>
          </Rise>
        </div>
      </section>

      {/* ================= 04 ASK SOCIA ================= */}
      <section id="ask" className="so-ch so-ask">
        <div className="so-wrap">
          <h2 className="so-h2"><Words text="Ask SOCIA anything about your content." /></h2>
          <Rise delay={120}>
            <p className="so-lead">
              Instant, data-backed answers based on your account, audience, competitors,
              and performance.
            </p>
          </Rise>
          <div className="so-ask-stage">
            <div className="so-sources left" aria-hidden>
              {["Instagram", "TikTok", "YouTube", "Account analytics"].map((s) => (
                <span key={s}>{s}<i /></span>
              ))}
            </div>
            <AskDemo />
            <div className="so-sources right" aria-hidden>
              {["Competitor intelligence", "Audience behavior", "Historical performance", "Content library"].map((s) => (
                <span key={s}><i />{s}</span>
              ))}
            </div>
          </div>
          <Rise><p className="so-ask-note">SOCIA isn&apos;t guessing. It&apos;s reasoning from your data.</p></Rise>
        </div>
      </section>

      {/* ================= 05 LOOP ================= */}
      <section id="loop" className="so-ch so-loopsec">
        <div className="so-wrap">
          <Rise><span className="so-label">THE SOCIA LOOP</span></Rise>
          <h2 className="so-h2 dark"><Words text="A system that compounds every week." /></h2>
          <Rise delay={120}>
            <p className="so-lead dark">Every post creates another signal. Every signal makes SOCIA smarter.</p>
          </Rise>
          <Loop />
        </div>
      </section>

      {/* ================= 06 RESULTS ================= */}
      <section id="results" className="so-ch so-results">
        <div className="so-wrap">
          <Rise><span className="so-label">BEFORE / AFTER SOCIA</span></Rise>
          <h2 className="so-h2 dark"><Words text="Better decisions compound." /></h2>
          <Rise delay={120}>
            <p className="so-lead dark">
              From scattered signals to clear next moves. SOCIA turns your content data
              into decisions you can act on.
            </p>
          </Rise>

          <div className="so-ba">
            <Rise className="so-ba-col without">
              <div className="so-ba-inner">
                <small>WITHOUT SOCIA</small>
                <ul>
                  {["Guess what to post", "Manually research competitors", "Check multiple analytics dashboards", "Post whenever", "React after performance drops", "Repeat"].map((t) => (
                    <li key={t}><X size={14} /> {t}</li>
                  ))}
                </ul>
              </div>
            </Rise>
            <Rise delay={150} className="so-ba-mid-rise">
              <div className="so-ba-mid" aria-hidden>
                <svg viewBox="0 0 96 200" preserveAspectRatio="none">
                  <path className="so-basig" d="M0,28 C30,28 34,88 46,97" fill="none" />
                  <path className="so-basig s2" d="M0,58 C28,58 34,92 46,99" fill="none" />
                  <path className="so-basig s3" d="M0,100 L46,100" fill="none" />
                  <path className="so-basig s4" d="M0,142 C28,142 34,108 46,101" fill="none" />
                  <path className="so-basig s5" d="M0,172 C30,172 34,112 46,103" fill="none" />
                </svg>
                <span className="so-ba-arrow"><ArrowRight size={15} /></span>
              </div>
            </Rise>
            <Rise delay={260} className="so-ba-col with">
              <div className="so-ba-inner">
                <small>WITH SOCIA</small>
                <ul>
                  {["Know what to post", "See opportunities automatically", "Understand why content performs", "Publish at optimal times", "Score content before posting", "Improve every week"].map((t) => (
                    <li key={t}><Check size={14} /> {t}</li>
                  ))}
                </ul>
              </div>
            </Rise>
          </div>

          {/* product story */}
          <div className="so-story">
            {([
              ["01", "Your entire content strategy, scored.", "Content Audit", BarChart3, "Health score, five factor breakdown, momentum."],
              ["02", "See opportunities before competitors do.", "Competitor Intelligence", Users, "Rising formats and outlier posts, tracked daily."],
              ["03", "Know whether content is strong before publishing.", "Video Scorer", Play, "Hook, retention, clarity, pacing. Scored pre-publish."],
              ["04", "Turn analytics into your next post.", "AI Strategist", Sparkles, "Chat with an AI that knows your numbers."],
              ["05", "Know exactly when to publish.", "Smart Calendar", CalendarDays, "Best windows from your audience activity."],
            ] as const).map(([n, t, m, Ico, d], i) => (
              <Rise key={n} delay={i * 60} className="so-story-row">
                <div className="so-story-card" data-cursor="VIEW">
                  <span className="so-story-num">{n}</span>
                  <span className="so-story-ico"><Ico size={17} /></span>
                  <div className="so-story-txt">
                    <h3>{t}</h3>
                    <span className="so-story-mod">{m} interface</span>
                    <span className="so-story-detail">{d}</span>
                  </div>
                </div>
              </Rise>
            ))}
          </div>

          {/* pricing */}
          <div className="so-pricing" id="pricing">
            <Rise><h2 className="so-h2 dark sm">Your next strategy starts here.</h2></Rise>
            <div className="so-price-grid">
              <Rise className="so-price free">
                <div className="so-price-inner">
                  <svg className="so-price-art" viewBox="0 0 420 220" preserveAspectRatio="none" aria-hidden>
                    <path d="M-10,205 C110,190 210,150 430,40" fill="none" stroke="rgba(76,141,255,0.16)" strokeWidth="1" />
                    <path d="M-10,215 C130,205 240,175 430,90" fill="none" stroke="rgba(76,141,255,0.1)" strokeWidth="1" />
                    <path d="M-10,190 C90,180 220,120 430,-10" fill="none" stroke="rgba(76,141,255,0.07)" strokeWidth="1" />
                    <circle cx="318" cy="97" r="2" fill="rgba(96,165,250,0.4)" />
                    <circle cx="238" cy="140" r="1.6" fill="rgba(96,165,250,0.3)" />
                  </svg>
                  <small>FREE AUDIT</small>
                  <p className="so-price-lead">See what SOCIA finds in your account.</p>
                  <ul>
                    {["Account health score", "Content opportunities", "Performance breakdown", "Top recommendations", "Competitor snapshot"].map((f) => (
                      <li key={f}><Check size={14} /> {f}</li>
                    ))}
                  </ul>
                  <Link href="/signup" className="so-btn so-btn-blue" data-cursor="AUDIT">Start Free Audit <ArrowRight size={15} /></Link>
                  <span className="so-micro dark">No credit card required.</span>
                </div>
              </Rise>
              <Rise delay={100} className="so-price paid">
                <div className="so-price-inner">
                  <small>WHEN YOU&apos;RE READY</small>
                  <div className="so-paid-row">
                    <div className="so-paid-head"><b>Pro</b><span className="so-paid-price">$29<i>/mo</i></span></div>
                    <span className="so-paid-desc">Daily AI plans, scoring, best-time engine</span>
                  </div>
                  <div className="so-paid-row">
                    <div className="so-paid-head"><b>Growth</b><span className="so-paid-price">$79<i>/mo</i></span></div>
                    <span className="so-paid-desc">Unlimited accounts, trend alerts, priority AI</span>
                  </div>
                  <span className="so-micro dark">Both start with 7 days free. Cancel anytime.</span>
                </div>
              </Rise>
            </div>
          </div>

          {/* FAQ */}
          <div className="so-faq-wrap">
            <Rise><h2 className="so-h2 dark sm">Questions, answered.</h2></Rise>
            <Faq />
          </div>
        </div>
      </section>

      {/* ================= 07 START ================= */}
      <section id="start" className="so-ch so-start">
        <div className="so-wrap center">
          <h2 className="so-h1b"><Words text="Stop guessing. Start posting with confidence." /></h2>
          <Rise delay={150}>
            <p className="so-lead">
              See what SOCIA finds in your content, competitors, and audience in under 60 seconds.
            </p>
          </Rise>
          <Rise delay={250}>
            <Link href="/signup" className="so-btn so-btn-blue big" data-cursor="AUDIT">
              Start Your Free Audit <ArrowRight size={16} />
            </Link>
            <span className="so-micro">No credit card · Audit in under 60 seconds · Cancel anytime</span>
          </Rise>
        </div>

        {/* manifesto footer */}
        <footer className="so-footer">
          <div className="so-footer-statement">Better content starts with better decisions.</div>
          <div className="so-footer-grid">
            <div className="so-footer-brand">
              <span className="so-brand"><BrandMark size={26} /> SOCIA</span>
              <p>AI social intelligence for creators and teams.</p>
            </div>
            <div>
              <small>PRODUCT</small>
              <button onClick={() => jump("engine")}>Content Audit</button>
              <button onClick={() => jump("ask")}>AI Strategist</button>
              <button onClick={() => jump("engine")}>Competitor Intelligence</button>
              <button onClick={() => jump("engine")}>Video Scorer</button>
              <button onClick={() => jump("engine")}>Calendar</button>
            </div>
            <div>
              <small>ACCOUNT</small>
              <Link href="/login">Log In</Link>
              <Link href="/signup">Start Free Audit</Link>
              <Link href="/settings">Settings</Link>
            </div>
            <div>
              <small>LEGAL</small>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </div>
          </div>
          <div className="so-footer-copy">© 2026 SOCIA. All rights reserved.</div>
        </footer>
      </section>
    </div>
  );
}

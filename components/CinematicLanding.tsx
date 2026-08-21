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
} from "lucide-react";
import IntelligenceField from "./IntelligenceField";

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

const LOOP_STAGES = [
  { n: "01", t: "AUDIT", d: "Analyze your content, audience, niche, and competitors." },
  { n: "02", t: "PLAN", d: "Generate a weekly strategy based on opportunities." },
  { n: "03", t: "CREATE", d: "Turn strategy into posts, hooks, scripts, and concepts." },
  { n: "04", t: "SCORE", d: "Analyze content before publishing." },
  { n: "05", t: "PUBLISH", d: "Post during optimal audience windows." },
  { n: "06", t: "MEASURE", d: "Track what actually happened." },
  { n: "07", t: "LEARN", d: "Feed performance back into the next strategy." },
];

function Loop() {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const iv = setInterval(() => setActive((a) => (a + 1) % LOOP_STAGES.length), 1400);
    return () => clearInterval(iv);
  }, [inView]);

  return (
    <div ref={ref} className={`so-loop ${inView ? "in" : ""}`}>
      <div className="so-loop-ring" aria-hidden>
        <div className="so-loop-core"><span className="side-mark">S</span>SOCIA</div>
        {LOOP_STAGES.map((s, i) => {
          const ang = (i / LOOP_STAGES.length) * Math.PI * 2 - Math.PI / 2;
          const x = 50 + 44 * Math.cos(ang);
          const y = 50 + 44 * Math.sin(ang);
          return (
            <span
              key={s.n}
              className={`so-loop-node ${i === active ? "on" : ""}`}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {s.t}
            </span>
          );
        })}
      </div>
      <div className="so-loop-stage">
        <span className="so-loop-num">{LOOP_STAGES[active].n}</span>
        <h3>{LOOP_STAGES[active].t}</h3>
        <p>{LOOP_STAGES[active].d}</p>
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
    const tick = () => {
      const el = heroRef.current;
      if (el) {
        const p = Math.min(1.4, window.scrollY / window.innerHeight);
        el.style.setProperty("--p", String(p));
      }
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
        <Link href="/" className="so-brand"><span className="side-mark">S</span> SOCIA</Link>
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
        <div className="so-hero-inner">
          <Rise><span className="so-tag"><Sparkles size={12} /> AI SOCIAL INTELLIGENCE</span></Rise>
          <h1>
            <Words text="Know what to post" />
            <br />
            <span className="so-blue"><Words text="before you post it." /></span>
          </h1>
          <Rise delay={350}>
            <p className="so-hero-sub">
              SOCIA studies your content, audience, competitors, and performance. Then it
              tells you what to post, why it should work, and when to publish.
            </p>
          </Rise>
          <Rise delay={450}>
            <div className="so-hero-ctas">
              <Link href="/signup" className="so-btn so-btn-blue" data-cursor="AUDIT">
                Start Free Audit <ArrowRight size={15} />
              </Link>
              <button className="so-btn so-btn-ghost" onClick={() => jump("engine")} data-cursor="VIEW">
                See How It Works
              </button>
            </div>
            <span className="so-micro">No credit card · Audit in under 60 seconds</span>
          </Rise>

          {/* dimensional product interface */}
          <div className="so-deck" data-cursor="EXPLORE">
            <div className="so-deck-main">
              <div className="so-deck-head">
                <span className="side-mark sm">S</span> SOCIA · Live intelligence
                <span className="so-deck-pulse" />
              </div>
              <div className="so-deck-grid">
                <div className="so-mod"><small>ACCOUNT HEALTH</small><b><Num value={92} /> / 100</b><i className="so-mod-bar"><em style={{ width: "92%" }} /></i></div>
                <div className="so-mod"><small>ENGAGEMENT</small><b className="up">+<Num value={18.6} suffix="%" /></b></div>
                <div className="so-mod"><small>REACH</small><b><Num value={178.4} suffix="K" /></b></div>
                <div className="so-mod"><small>CONTENT OPPORTUNITIES</small><b>{"3 detected"}</b></div>
              </div>
              <svg className="so-deck-chart" viewBox="0 0 320 74" preserveAspectRatio="none" aria-hidden>
                <defs>
                  <linearGradient id="soga" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563ff" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#2563ff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path className="so-chart-area" d="M0,60 L30,54 L60,57 L90,46 L120,49 L150,38 L180,41 L210,30 L240,25 L270,27 L300,14 L320,10 L320,74 L0,74 Z" fill="url(#soga)" />
                <path className="so-chart-line" d="M0,60 L30,54 L60,57 L90,46 L120,49 L150,38 L180,41 L210,30 L240,25 L270,27 L300,14 L320,10" fill="none" stroke="#60a5fa" strokeWidth="2" />
              </svg>
            </div>
            <div className="so-deck-chip c1"><small>COMPETITOR MOVEMENT</small><b className="up">+24%</b></div>
            <div className="so-deck-chip c2"><small>BEST POSTING WINDOW</small><b>Thursday · 6:40 PM</b></div>
            <div className="so-deck-chip c3"><small>RECOMMENDATION</small><b>Educational Reel</b><span>2.4× your average engagement</span></div>
          </div>

          {/* trust layer */}
          <div className="so-trust">
            <small>TRUSTED BY CREATORS &amp; TEAMS</small>
            <div className="so-trust-stats">
              <div><b><Num value={40} suffix="K+" /></b><span>accounts analyzed</span></div>
              <div><b><Num value={6} suffix=" hrs" /></b><span>saved per week</span></div>
              <div><b><Num value={3.2} suffix="×" /></b><span>engagement improvement</span></div>
              <div><b><Num value={92} suffix="%" /></b><span>strategy completion</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= 02 PROBLEM ================= */}
      <section id="problem" className="so-ch so-problem">
        <div className="so-wrap">
          <h2 className="so-h2"><Words text="Posting shouldn’t be guesswork." /></h2>
          <Rise delay={150}>
            <p className="so-lead">
              Creators produce more content than ever, but most still make decisions using
              instinct, outdated analytics, and whatever happened to work last week.
              <b> SOCIA turns those signals into decisions.</b>
            </p>
          </Rise>
          <div className="so-signals">
            {[
              ["NO CLEAR STRATEGY", "Posting without a plan creates inconsistent results."],
              ["WRONG CONTENT", "Guessing what works wastes time and reach."],
              ["MISSED OPPORTUNITIES", "Winning formats and topics are often visible before creators notice them."],
              ["FALLING BEHIND", "Competitors learn faster while you’re still interpreting yesterday’s analytics."],
            ].map(([t, d], i) => (
              <Rise key={t} delay={i * 120} className="so-signal-wrap">
                <div className="so-signal">
                  <span className="so-signal-dot" />
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </Rise>
            ))}
          </div>
        </div>
      </section>

      {/* ================= 03 ENGINE ================= */}
      <section id="engine" className="so-ch so-engine">
        <div className="so-wrap">
          <Rise><span className="so-label">THE SOCIA INTELLIGENCE ENGINE</span></Rise>
          <h2 className="so-h2 dark"><Words text="Everything from audit to analytics." /></h2>
          <Rise delay={120}>
            <p className="so-lead dark">
              One system watches, analyzes, plans, creates, and measures. Every week
              starts smarter than the last.
            </p>
          </Rise>

          <div className="so-bento">
            {/* content audit — large */}
            <Rise className="so-b b-audit">
              <div className="so-b-inner" data-cursor="VIEW">
                <div className="so-b-head"><ScanSearch size={15} /> CONTENT AUDIT</div>
                <div className="so-audit-score"><b><Num value={92} /></b><span>/ 100</span><em>Account Health</em></div>
                <div className="so-audit-bars">
                  {[["Hook strength", 91], ["Posting consistency", 84], ["Topic concentration", 76], ["Engagement efficiency", 88], ["Content diversity", 71]].map(([l, v]) => (
                    <div key={l as string} className="so-abar"><span>{l}</span><i><em style={{ width: `${v}%` }} /></i><b>{v}</b></div>
                  ))}
                </div>
                <Link href="/signup" className="so-b-cta">View full audit <ArrowRight size={13} /></Link>
              </div>
            </Rise>

            {/* competitor intelligence */}
            <Rise delay={80} className="so-b b-comp">
              <div className="so-b-inner" data-cursor="VIEW">
                <div className="so-b-head"><Radar size={15} /> COMPETITOR INTELLIGENCE</div>
                <div className="so-comp-rows">
                  <div><i>A</i><span>Competitor A</span><b className="up">+31% momentum</b></div>
                  <div><i>B</i><span>Competitor B</span><b>2 outlier posts detected</b></div>
                  <div><i>C</i><span>Competitor C</span><b>Educational Reels gaining traction</b></div>
                </div>
                <Link href="/signup" className="so-b-cta">Scan competitors <ArrowRight size={13} /></Link>
              </div>
            </Rise>

            {/* recommendation engine */}
            <Rise delay={140} className="so-b b-rec">
              <div className="so-b-inner" data-cursor="CREATE">
                <div className="so-b-head"><TrendingUp size={15} /> RECOMMENDATION ENGINE</div>
                <span className="so-rec-tag">HIGH IMPACT</span>
                <h3>Publish another educational Reel.</h3>
                <p className="so-rec-why"><b>Why?</b> Your educational videos are generating 2.4× your average engagement.</p>
                <p className="so-rec-hook">Recommended hook: <em>&ldquo;3 mistakes killing your content reach…&rdquo;</em></p>
                <Link href="/signup" className="so-b-cta">Create this post <ArrowRight size={13} /></Link>
              </div>
            </Rise>

            {/* video scorer */}
            <Rise delay={200} className="so-b b-score">
              <div className="so-b-inner" data-cursor="PLAY">
                <div className="so-b-head"><Video size={15} /> VIDEO SCORER</div>
                <div className="so-vs">
                  <div className="so-vs-big"><b><Num value={82} /></b><span>/ 100</span></div>
                  <div className="so-vs-subs">
                    {[["HOOK", 91], ["RETENTION", 78], ["CLARITY", 86], ["PACING", 74]].map(([l, v]) => (
                      <span key={l as string}><small>{l}</small><b>{v}</b></span>
                    ))}
                  </div>
                </div>
                <p className="so-vs-pred">Predicted retention <b className="up">+17%</b></p>
                <Link href="/signup" className="so-b-cta">Improve video <ArrowRight size={13} /></Link>
              </div>
            </Rise>

            {/* smart scheduling */}
            <Rise delay={260} className="so-b b-sched">
              <div className="so-b-inner" data-cursor="VIEW">
                <div className="so-b-head"><CalendarDays size={15} /> SMART SCHEDULING</div>
                <div className="so-week">
                  {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                    <div key={i} className={`so-day ${[1, 3, 5].includes(i) ? "hot" : ""}`}>
                      <span>{d}</span>
                      {i === 1 && <b>6:20 PM</b>}
                      {i === 3 && <b>6:40 PM</b>}
                      {i === 5 && <b>11:15 AM</b>}
                    </div>
                  ))}
                </div>
                <p className="so-week-note"><Clock size={12} /> Audience activity peak</p>
              </div>
            </Rise>
          </div>
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
          <Rise><span className="so-label">HOW SOCIA WORKS</span></Rise>
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
            <Rise delay={120} className="so-ba-col with">
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
            {[
              ["01", "Your entire content strategy, scored.", "Content Audit"],
              ["02", "See opportunities before competitors do.", "Competitor Intelligence"],
              ["03", "Know whether content is strong before publishing.", "Video Scorer"],
              ["04", "Turn analytics into your next post.", "AI Strategist"],
              ["05", "Know exactly when to publish.", "Smart Calendar"],
            ].map(([n, t, m], i) => (
              <Rise key={n} delay={i * 60} className="so-story-row">
                <div className="so-story-card" data-cursor="VIEW">
                  <span className="so-story-num">{n}</span>
                  <h3>{t}</h3>
                  <span className="so-story-mod">{m} interface</span>
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
                  <div className="so-paid-row"><b>Pro</b><span>$29/mo · daily AI plans, scoring, best-time engine</span></div>
                  <div className="so-paid-row"><b>Growth</b><span>$79/mo · unlimited accounts, trend alerts, priority AI</span></div>
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
              <span className="so-brand"><span className="side-mark">S</span> SOCIA</span>
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
              <span className="so-footer-soon">Privacy · Terms (coming soon)</span>
            </div>
          </div>
          <div className="so-footer-copy">© 2026 SOCIA. All rights reserved.</div>
        </footer>
      </section>
    </div>
  );
}

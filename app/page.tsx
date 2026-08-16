import Link from "next/link";
import {
  Sparkles,
  Search,
  Radar,
  Video,
  CalendarClock,
  BarChart3,
  ArrowRight,
  Check,
  Compass,
  XCircle,
  LineChart,
  Clock,
  RefreshCw,
  Send,
  ChevronDown,
  Camera,
  Play,
  Music2,
  Users,
  Eye,
  FileText,
  TrendingUp,
} from "lucide-react";
import FaqAccordion from "@/components/FaqAccordion";

export const metadata = {
  title: "SOCIA — Know what to post before you post it",
  description:
    "SOCIA is your AI social strategist. It audits your account, studies competitors, and hands you a weekly plan — content already generated and scored.",
};

function Spark({ color = "#2563ff", up = true }: { color?: string; up?: boolean }) {
  const d = up
    ? [12, 14, 13, 16, 15, 19, 18, 22, 21, 26, 30]
    : [30, 26, 27, 22, 24, 19, 20, 16, 15, 12, 10];
  const max = Math.max(...d), min = Math.min(...d);
  const pts = d.map((v, i) => `${(i / (d.length - 1)) * 100},${28 - ((v - min) / (max - min)) * 24 - 2}`).join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="nl-spark">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const LOGOS = ["northloop", "Verve", "STUDIO/9", "Hatch&Co", "Meridian", "bloomtide"];
const STATS = [
  { v: "3.2x", l: "more engagement" },
  { v: "6hrs", l: "saved per week" },
  { v: "92%", l: "score-to-hit rate" },
  { v: "40k+", l: "accounts audited" },
];
const PROBLEMS = [
  { Icon: Compass, t: "No clear strategy", b: "Posting without a plan leads to inconsistent results." },
  { Icon: XCircle, t: "Wrong content", b: "Guessing what works wastes time and lowers reach." },
  { Icon: LineChart, t: "Missing opportunities", b: "You might be overlooking trends and winning formats." },
  { Icon: Clock, t: "Falling behind", b: "Competitors iterate faster while you're figuring it out." },
];
const FEATURES = [
  { Icon: Search, t: "Content Audit", b: "A score for every post with strengths, problems backed by evidence, and your top fixes." },
  { Icon: Sparkles, t: "Recommendation Engine", b: "A weekly plan of post cards — hook, format, angle, caption, and timing based on data." },
  { Icon: CalendarClock, t: "Smart Scheduling", b: "Drag-and-drop calendar with optimal time slots and a live preview of each post." },
  { Icon: Radar, t: "Competitor Scanner", b: "Track rivals, catch their outlier posts, and get plain-English breakdowns of why each won." },
  { Icon: Video, t: "Video Scorer", b: "Upload a draft. Get a score for hook strength, retention, clarity, and improvement tips." },
  { Icon: BarChart3, t: "Performance Analytics", b: "Deep analytics that connect content to results so you know what to do next." },
];
const LOOP = [
  { Icon: Search, n: "1", t: "Audit", b: "We analyze your content, audience & competitors." },
  { Icon: Sparkles, n: "2", t: "Plan", b: "SOCIA creates your weekly content plan." },
  { Icon: Video, n: "3", t: "Create & Score", b: "Generate, refine, and score content before posting." },
  { Icon: BarChart3, n: "4", t: "Measure", b: "Track performance and find what moves the needle." },
  { Icon: RefreshCw, n: "5", t: "Repeat", b: "Keep improving. Keep compounding." },
];
const RESULTS = [
  { name: "Jenny Park", role: "Creator", tier: "Free", pct: "+147%", note: "Reach in 30 days", cta: "Get started free", hi: false, up: true },
  { name: "Dylan Martinez", role: "Fitness Coach", tier: "Pro", pct: "+86%", note: "Everything in Free · AI Strategist Chat · Competitor tracking · Smart scheduling · Priority support", cta: "Start 7-day free trial", hi: true, up: true },
  { name: "The Growth Lab", role: "Marketing Agency", tier: "Team", pct: "+203%", note: "Views in 60 days", cta: "Start 7-day free trial", hi: false, up: true },
];
const PROMPTS = ["What should I post Thursday?", "Give me 5 content ideas", "Audit my latest post"];

export default function LandingPage() {
  return (
    <div className="nl">
      {/* announcement bar */}
      <div className="nl-announce">
        <Sparkles size={13} /> NEW: AI Content Ideas are now 2x smarter. Try it in your free audit.
        <Link href="/signup" className="nl-announce-link">Learn more <ArrowRight size={12} /></Link>
      </div>

      {/* nav */}
      <nav className="nl-nav">
        <div className="nl-nav-inner">
          <Link href="/" className="nl-brand"><span className="side-mark">S</span>SOCIA</Link>
          <div className="nl-links">
            <span>Product <ChevronDown size={13} /></span>
            <span>Solutions <ChevronDown size={13} /></span>
            <span>Resources <ChevronDown size={13} /></span>
            <a href="#pricing">Pricing</a>
          </div>
          <div className="nl-nav-cta">
            <Link href="/login" className="nl-signin">Log in</Link>
            <Link href="/signup" className="btn-primary">Start free audit <ArrowRight size={15} /></Link>
          </div>
        </div>
      </nav>

      {/* hero */}
      <header className="nl-hero">
        <div className="nl-hero-copy">
          <span className="nl-eyebrow">AI Social Strategist</span>
          <h1 className="nl-h1">Know what to post <span className="accent-text">before you post it.</span></h1>
          <p className="nl-sub">
            SOCIA is your AI social strategist. It audits your account, studies your competitors,
            and hands you a weekly plan — with the content already generated and scored.
          </p>
          <div className="nl-hero-cta">
            <Link href="/signup" className="btn-primary lg">Start free audit</Link>
            <a href="#loop" className="btn-secondary lg">See how it works</a>
          </div>
          <div className="nl-trustline">
            <span><Check size={14} /> No credit card</span>
            <span><Check size={14} /> Audit in under 60 seconds</span>
            <span><Check size={14} /> Cancel anytime</span>
          </div>
        </div>
        <div className="nl-hero-shot"><DashboardMock /></div>
      </header>

      {/* logos */}
      <section className="nl-logos">
        <p>Trusted by creators &amp; teams posting to millions</p>
        <div className="nl-logo-row">{LOGOS.map((l) => <span key={l}>{l}</span>)}</div>
      </section>

      {/* stats */}
      <section className="nl-stats">
        {STATS.map((s) => (
          <div key={s.l}><b>{s.v}</b><span>{s.l}</span></div>
        ))}
      </section>

      {/* problem (dark) */}
      <section className="nl-dark">
        <div className="nl-dark-grid">
          <div className="nl-dark-copy">
            <span className="nl-eyebrow blue">The Problem</span>
            <h2 className="nl-h2 light">Posting shouldn&apos;t <br /><span className="accent-text">be guesswork.</span></h2>
            <p className="nl-lead-dark">
              Most creators waste hours creating content that underperforms. SOCIA removes the
              guesswork with AI that shows you what will work before you hit publish.
            </p>
          </div>
          <div className="nl-prob-grid">
            {PROBLEMS.map(({ Icon, t, b }) => (
              <div className="nl-prob" key={t}>
                <span className="nl-prob-ico"><Icon size={18} /></span>
                <b>{t}</b>
                <small>{b}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* full loop */}
      <section className="nl-loop-sec" id="features">
        <div className="nl-loop-head">
          <span className="nl-eyebrow">The Full Loop</span>
          <h2 className="nl-h2">Everything from audit<br />to analytics</h2>
          <p className="nl-lead">One system that watches, plans, creates, and measures — so you never stare at a blank calendar again.</p>
        </div>
        <div className="nl-loop-grid">
          <div className="nl-loop-col">
            {[FEATURES[0], FEATURES[1], FEATURES[2]].map(({ Icon, t, b }) => (
              <div className="nl-feature" key={t}>
                <span className="nl-feature-ico"><Icon size={18} /></span>
                <b>{t}</b><small>{b}</small>
              </div>
            ))}
          </div>
          <ChatMock />
          <div className="nl-loop-col">
            {[FEATURES[3], FEATURES[4], FEATURES[5]].map(({ Icon, t, b }) => (
              <div className="nl-feature" key={t}>
                <span className="nl-feature-ico"><Icon size={18} /></span>
                <b>{t}</b><small>{b}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI that thinks (dark) */}
      <section className="nl-dark think">
        <div className="nl-think-grid">
          <div className="nl-dark-copy">
            <span className="nl-eyebrow blue">AI That Thinks</span>
            <h2 className="nl-h2 light">Ask SOCIA anything<br />about your content.</h2>
            <p className="nl-lead-dark">Get instant, data-backed answers and recommended actions you can use right now.</p>
            <div className="nl-think-tags">
              <span><FileText size={13} /> Data from your account</span>
              <span><Radar size={13} /> Competitor intelligence</span>
              <span><Sparkles size={13} /> Real-time insights</span>
            </div>
          </div>
          <div className="nl-think-visual">
            <div className="nl-think-card">
              <div className="nl-think-q">Which type of content is performing best right now?</div>
              <div className="nl-think-a">
                <Sparkles size={15} className="nl-think-a-ico" />
                <div>
                  <p>Educational Reels are your top performer this month. They generate 2.4x more engagement than your average.</p>
                  <div className="nl-think-metric">
                    <span>Educational Reels</span>
                    <b className="nl-up">↑ 2.4x</b>
                  </div>
                  <Spark color="#60a5fa" />
                </div>
              </div>
              <div className="nl-think-prompts">
                {PROMPTS.map((p) => <span key={p}>{p}</span>)}
                <button className="nl-think-send"><Send size={14} /></button>
              </div>
            </div>
            <span className="nl-plat-float ig"><Camera size={16} /></span>
            <span className="nl-plat-float yt"><Play size={16} fill="#fff" /></span>
            <span className="nl-plat-float tt"><Music2 size={16} /></span>
          </div>
        </div>
      </section>

      {/* how the loop works */}
      <section className="nl-how" id="loop">
        <div className="nl-loop-head">
          <span className="nl-eyebrow">How The Loop Works</span>
          <h2 className="nl-h2">A system that compounds every week</h2>
          <p className="nl-lead">Each post feeds the next audit. The more you run it, the sharper it gets.</p>
        </div>
        <div className="nl-steps">
          {LOOP.map(({ Icon, n, t, b }, i) => (
            <div className={`nl-step${i === 2 ? " center" : ""}`} key={n}>
              <span className="nl-step-node">{i === 2 ? "SOCIA" : <Icon size={20} />}</span>
              <b>{n} {t}</b>
              <small>{b}</small>
              {i < LOOP.length - 1 && <ArrowRight className="nl-step-arrow" size={18} />}
            </div>
          ))}
        </div>
      </section>

      {/* results */}
      <section className="nl-results">
        <div className="nl-results-head"><span className="nl-eyebrow">Real Creators.</span><span className="nl-eyebrow muted">Real Results.</span></div>
        <div className="nl-result-grid">
          {RESULTS.map((r) => (
            <div className={`nl-result${r.hi ? " hi" : ""}`} key={r.name}>
              {r.hi && <span className="nl-result-badge">Most Popular</span>}
              <div className="nl-result-top">
                <span className="nl-result-avatar">{r.name[0]}</span>
                <div><b>{r.name}</b><small>{r.tier} · {r.role}</small></div>
              </div>
              <div className="nl-result-pct">{r.pct}</div>
              <p className="nl-result-note">{r.note}</p>
              <Spark up={r.up} />
              <Link href="/signup" className={r.hi ? "btn-primary full" : "btn-secondary full"}>{r.cta}</Link>
            </div>
          ))}
        </div>
        <p className="nl-results-foot">7-day free trial · Cancel anytime · No credit card required</p>
      </section>

      {/* faq */}
      <section className="nl-faq-sec" id="pricing">
        <div className="nl-faq-left">
          <span className="nl-eyebrow">FAQ</span>
          <h2 className="nl-h2">Everything you<br />need to know.</h2>
        </div>
        <FaqAccordion />
      </section>

      {/* final CTA */}
      <section className="nl-cta">
        <h2>Ready to post with confidence?</h2>
        <p className="nl-cta-sub">Start your free audit now.</p>
        <span className="nl-cta-note">No credit card · Results in under 60 seconds</span>
        <Link href="/signup" className="nl-cta-btn">Start free audit <ArrowRight size={16} /></Link>
      </section>

      {/* footer */}
      <footer className="nl-footer">
        <Link href="/" className="nl-brand light"><span className="side-mark">S</span>SOCIA</Link>
        <span>© 2026 SOCIA · Your AI social strategist</span>
      </footer>
    </div>
  );
}

/* ---- hero dashboard preview ---- */
function DashboardMock() {
  return (
    <div className="dm">
      <div className="dm-side">
        <div className="dm-logo"><span className="side-mark sm">S</span></div>
        {[Users, BarChart3, Radar, Sparkles, FileText, Video, CalendarClock].map((I, i) => (
          <span key={i} className={`dm-navi${i === 0 ? " on" : ""}`}><I size={13} /></span>
        ))}
      </div>
      <div className="dm-main">
        <div className="dm-head">
          <div><b>Good morning, Alex 👋</b><small>Here&apos;s what&apos;s happening with your content.</small></div>
          <span className="dm-pill">May 10 – May 16 <ChevronDown size={11} /></span>
        </div>
        <div className="dm-kpis">
          {[
            { Icon: Eye, l: "Total Reach", v: "1.2M", d: "+34.6%" },
            { Icon: TrendingUp, l: "Engagement Rate", v: "6.7%", d: "+18.6%" },
            { Icon: FileText, l: "Posts Published", v: "14", d: "+7" },
          ].map((k) => (
            <div className="dm-kpi" key={k.l}>
              <div className="dm-kpi-top"><span>{k.l}</span><k.Icon size={12} /></div>
              <b>{k.v}</b>
              <span className="dm-up">{k.d}</span>
              <Spark />
            </div>
          ))}
        </div>
        <div className="dm-row">
          <div className="dm-brief">
            <div className="dm-brief-top"><Sparkles size={11} /> AI Strategy Brief <span className="dm-tag">High Impact</span></div>
            <p>Educational Reels are driving <b>2.4x</b> more engagement than your average this week.</p>
            <div className="dm-brief-btns"><span className="dm-btn">Ask AI Strategist</span><span className="dm-btn ghost">View full strategy</span></div>
          </div>
          <div className="dm-actions">
            <div className="dm-actions-head">Recommended Actions</div>
            {["Publish another educational Reel", "Competitor format gaining traction", "You have an open posting window"].map((a, i) => (
              <div className="dm-action" key={i}><span className={`dm-adot c${i}`} /><span>{a}</span></div>
            ))}
          </div>
        </div>
        <div className="dm-row">
          <div className="dm-chart"><div className="dm-chart-head">Reach Over Time</div><Spark /></div>
          <div className="dm-top">
            <div className="dm-top-head">Top Content</div>
            {["3 Content Ideas That…", "How I Plan My Content…", "Content Strategy…"].map((t, i) => (
              <div className="dm-top-row" key={i}><span className="dm-thumb" />{t}<b className="dm-up">+{[2.7, 2.1, 1.8][i]}x</b></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- center AI chat mock (full-loop section) ---- */
function ChatMock() {
  return (
    <div className="nl-chatmock">
      <div className="nl-cm-head">
        <span className="nl-cm-title"><Sparkles size={14} /> AI Strategist Chat</span>
        <span className="nl-cm-live"><span className="nl-cm-dot" /> Live</span>
      </div>
      <div className="nl-cm-body">
        <div className="nl-cm-user">What should I post Thursday?</div>
        <div className="nl-cm-bot">
          Your audience responds best to educational Reels on Thursdays between 6–9PM. I recommend a 20–30s tip video.
        </div>
        <div className="nl-cm-perf">
          <span>Predicted performance</span>
          <b className="nl-up">↑ 31% above your average</b>
        </div>
        <div className="nl-cm-gen">Generate this post <ArrowRight size={13} /></div>
      </div>
    </div>
  );
}

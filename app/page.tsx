import Link from "next/link";
import {
  Sparkles,
  Search,
  Radar,
  MessageSquare,
  Video,
  CalendarClock,
  ArrowRight,
  Check,
  TrendingUp,
} from "lucide-react";
import FaqAccordion from "@/components/FaqAccordion";

export const metadata = {
  title: "SOCIA — Know what to post before you post it",
  description:
    "SOCIA is your AI social strategist. It audits your account, studies competitors, and hands you a weekly plan — content already generated and scored.",
};

const LOGOS = ["northloop", "Verve", "STUDIO/9", "Hatch&Co", "Meridian", "bloomtide"];

const STATS = [
  { value: "3.4×", label: "more engagement" },
  { value: "6 hrs", label: "saved per week" },
  { value: "92%", label: "score-to-hit rate" },
  { value: "40k+", label: "accounts audited" },
];

const FEATURES = [
  { Icon: Search, title: "Content Audit", body: "A 0–100 health score with strengths, problems backed by evidence, and your top-3 ranked fixes." },
  { Icon: Radar, title: "Competitor Scanner", body: "Track rivals, catch their outlier posts, and get a plain-English breakdown of why each one won." },
  { Icon: Sparkles, title: "Recommendation Engine", body: "A weekly plan of post cards — hook, format, predicted performance, and the evidence behind it." },
  { Icon: MessageSquare, title: "AI Strategist Chat", body: "Ask anything. It knows your account, niche, and numbers — and answers with actionable advice." },
  { Icon: Video, title: "Video Scorer", body: "Upload a draft. Get per-dimension scores, a predicted retention curve, and timestamped fixes." },
  { Icon: CalendarClock, title: "Smart Scheduling", body: "Drag-and-drop calendar with optimal time slots and a live preview of every post." },
];

const LOOP = [
  { n: "01", title: "Audit", body: "Score the account and surface what's working." },
  { n: "02", title: "Plan", body: "Turn it into a weekly plan of specific posts." },
  { n: "03", title: "Create & score", body: "Generate the content and grade it before posting." },
  { n: "04", title: "Measure", body: "Track results — which feed the next audit." },
];

const TIERS = [
  { name: "Starter", price: "$0", who: "For solo creators getting going.", feats: ["1 social account", "Monthly audit", "5 post recommendations", "Basic analytics"], cta: "Get started", hi: false },
  { name: "Pro", price: "$29", who: "For creators who post daily.", feats: ["3 accounts", "Weekly audit + competitors", "Unlimited recommendations", "Video scorer + scheduling", "AI strategist chat"], cta: "Start Pro trial", hi: true },
  { name: "Studio", price: "$79", who: "For small teams & brands.", feats: ["10 accounts", "Everything in Pro", "Graphic & ad generator", "Team of 5 + approvals", "Benchmarked analytics"], cta: "Choose Studio", hi: false },
  { name: "Agency", price: "$199", who: "For agencies with clients.", feats: ["Unlimited accounts", "Client workspaces", "White-label reports", "Approval flows", "Priority support"], cta: "Talk to sales", hi: false },
];

const TESTI = [
  { quote: "The video scorer is scary good. It flagged a weak hook, I re-shot 4 seconds, and the post did 3× my average.", name: "Maya Okafor", role: "Creator · 480k followers" },
  { quote: "We replaced three tools and a Friday planning meeting with SOCIA. The weekly plan is just… there.", name: "Daniel Reyes", role: "Head of Social, Verve" },
  { quote: "White-label reports won us two retainers. Clients think we have a data team. It's just SOCIA.", name: "Priya Nair", role: "Founder, STUDIO/9" },
];

export default function LandingPage() {
  return (
    <div className="lp">
      {/* nav */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <Link href="/" className="lp-brand">
            <span className="side-mark">S</span>SOCIA
          </Link>
          <div className="lp-links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="lp-nav-cta">
            <Link href="/login" className="lp-signin">Sign in</Link>
            <Link href="/signup" className="btn-primary">Get started</Link>
          </div>
        </div>
      </nav>

      {/* hero */}
      <header className="lp-hero">
        <div className="lp-hero-copy">
          <span className="lp-pill">
            <Sparkles size={13} /> Now scoring videos before you post
          </span>
          <h1 className="lp-h1">
            Know what to post <span className="accent-text">before</span> you post it.
          </h1>
          <p className="lp-sub">
            SOCIA is your AI social strategist. It audits your account, studies your
            competitors, and hands you a weekly plan — with the content already generated
            and scored.
          </p>
          <div className="lp-hero-cta">
            <Link href="/signup" className="btn-primary lg">Start free audit</Link>
            <a href="#how" className="btn-secondary lg">See how it works</a>
          </div>
          <p className="lp-note">No credit card · Audit in under 60 seconds</p>
        </div>
        <div className="lp-hero-visual">
          <div className="lp-mock">
            <div className="lp-mock-head">
              <span className="lp-mock-dot" /> <span className="lp-mock-dot" /> <span className="lp-mock-dot" />
              <span className="lp-mock-url">app.socia.ai / dashboard</span>
            </div>
            <div className="lp-mock-body">
              <div className="lp-mock-score">
                <div className="lp-mock-ring">87</div>
                <div>
                  <b>Content Score</b>
                  <span className="lp-mock-good">Great — likely to perform</span>
                </div>
              </div>
              {[["Hook", 92], ["Retention", 85], ["Relevance", 88], ["Timing", 90]].map(([l, v]) => (
                <div className="lp-mock-bar" key={l as string}>
                  <span>{l}</span>
                  <span className="lp-mock-track"><span style={{ width: `${v}%` }} /></span>
                  <b>{v}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* logos */}
      <section className="lp-logos">
        <p>Trusted by creators &amp; teams posting to millions</p>
        <div className="lp-logo-row">
          {LOGOS.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </section>

      {/* stats */}
      <section className="lp-stats">
        {STATS.map((s) => (
          <div key={s.label}>
            <b>{s.value}</b>
            <span>{s.label}</span>
          </div>
        ))}
      </section>

      {/* features */}
      <section className="lp-section" id="features">
        <div className="lp-section-head">
          <span className="lp-eyebrow">The full loop</span>
          <h2 className="lp-h2">Everything from audit to analytics</h2>
          <p className="lp-lead">
            One system that watches, plans, creates, and measures — so you never stare at a
            blank calendar again.
          </p>
        </div>
        <div className="lp-features">
          {FEATURES.map(({ Icon, title, body }) => (
            <div className="lp-feature" key={title}>
              <span className="lp-feature-ico"><Icon size={20} /></span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section className="lp-section alt" id="how">
        <div className="lp-section-head">
          <span className="lp-eyebrow">How the loop works</span>
          <h2 className="lp-h2">A system that compounds every week</h2>
          <p className="lp-lead">Each post feeds the next audit. The more you run it, the sharper it gets.</p>
        </div>
        <div className="lp-loop">
          {LOOP.map((s, i) => (
            <div className="lp-loop-step" key={s.n}>
              <span className="lp-loop-n">{s.n}</span>
              <h4>{s.title}</h4>
              <p>{s.body}</p>
              {i < LOOP.length - 1 && <ArrowRight className="lp-loop-arrow" size={18} />}
            </div>
          ))}
        </div>
      </section>

      {/* pricing */}
      <section className="lp-section" id="pricing">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Pricing</span>
          <h2 className="lp-h2">Plans that scale with you</h2>
          <p className="lp-lead">Start free. Upgrade when the loop pays for itself.</p>
        </div>
        <div className="lp-pricing">
          {TIERS.map((t) => (
            <div className={`lp-tier${t.hi ? " hi" : ""}`} key={t.name}>
              {t.hi && <span className="lp-tier-badge">Popular</span>}
              <div className="lp-tier-name">{t.name}</div>
              <div className="lp-tier-price">{t.price}<span>/mo</span></div>
              <p className="lp-tier-who">{t.who}</p>
              <ul>
                {t.feats.map((f) => (
                  <li key={f}><Check size={15} /> {f}</li>
                ))}
              </ul>
              <Link href="/signup" className={t.hi ? "btn-primary full" : "btn-secondary full"}>
                {t.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* testimonials */}
      <section className="lp-section alt">
        <div className="lp-testi">
          {TESTI.map((t) => (
            <figure className="lp-quote" key={t.name}>
              <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
              <figcaption>
                <b>{t.name}</b>
                <span>{t.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* faq */}
      <section className="lp-section" id="faq">
        <div className="lp-section-head">
          <span className="lp-eyebrow">FAQ</span>
          <h2 className="lp-h2">Questions, answered</h2>
        </div>
        <FaqAccordion />
      </section>

      {/* cta band */}
      <section className="lp-cta-band">
        <div>
          <h2>Know what to post before you post it.</h2>
          <p>Run your first audit free — 60 seconds, no credit card.</p>
        </div>
        <Link href="/signup" className="btn-primary lg">
          Start free audit <ArrowRight size={16} />
        </Link>
      </section>

      {/* footer */}
      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <Link href="/" className="lp-brand">
            <span className="side-mark">S</span>SOCIA
          </Link>
          <p>Your AI social strategist.</p>
        </div>
        <div className="lp-footer-links">
          <div>
            <b>Product</b>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <Link href="/login">Sign in</Link>
          </div>
          <div>
            <b>Company</b>
            <a href="#">About</a>
            <a href="#">Blog</a>
            <a href="#">Contact</a>
          </div>
          <div>
            <b>Legal</b>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </div>
        </div>
        <div className="lp-footer-foot">© 2026 SOCIA</div>
      </footer>
    </div>
  );
}

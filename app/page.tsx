import Link from "next/link";
import { Geist } from "next/font/google";
import {
  ArrowRight,
  Sparkles,
  Check,
  ScanSearch,
  Gauge,
  Clock,
  ShieldCheck,
  CalendarCheck,
  TrendingUp,
} from "lucide-react";
import UzFaq from "@/components/UzFaq";

const geist = Geist({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-display" });

export const metadata = {
  title: "SOCIA — Know what to post before you post it",
  description:
    "SOCIA reads your account, scores your ideas, and hands you a daily plan that grows you on purpose.",
};

const LOGOS = ["northloop", "Verve", "STUDIO/9", "Hatch&Co", "Meridian", "bloomtide"];

const WHY = [
  "Your plan is built from your own account, not a template",
  "Every idea is scored before you spend a minute filming",
  "Your best posting windows come from your real engagement",
  "Competitor moves show up in your plan, not in your anxiety",
];

const VALUES = [
  {
    icon: <ShieldCheck size={20} />,
    title: "Honest by design",
    body: "No invented numbers. Every stat on your dashboard comes from your synced account, and the AI says so when it is guessing.",
  },
  {
    icon: <CalendarCheck size={20} />,
    title: "A plan every day",
    body: "Wake up to what to post, when to post it, and the hook to open with. The thinking is done before you are.",
  },
  {
    icon: <TrendingUp size={20} />,
    title: "Built to compound",
    body: "Each post feeds the next plan. The longer you run SOCIA, the sharper it gets about what grows your account.",
  },
];

export default function Landing() {
  return (
    <div className={`uz ${geist.variable}`}>
      {/* nav */}
      <header className="uz-nav">
        <Link href="/" className="uz-brand">
          <span className="side-mark">S</span> SOCIA
        </Link>
        <nav className="uz-links">
          <a href="#capabilities">Capabilities</a>
          <a href="#why">Why SOCIA</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="uz-nav-cta">
          <Link href="/login" className="uz-ghostlink">Log in</Link>
          <Link href="/signup" className="uz-pill uz-pill-light">Try SOCIA</Link>
        </div>
      </header>

      {/* hero */}
      <section className="uz-hero">
        <div className="uz-silk" aria-hidden>
          <i className="s1" /><i className="s2" /><i className="s3" />
        </div>
        <div className="uz-hero-inner">
          <span className="uz-badge"><Sparkles size={13} /> Built to grow accounts</span>
          <h1>
            Know what to post
            <br />
            before you post it.
          </h1>
          <p>
            SOCIA reads your account, scores your ideas, and hands you a daily plan
            that grows you on purpose.
          </p>
          <div className="uz-hero-ctas">
            <Link href="/signup" className="uz-pill uz-pill-light">
              Start free trial <span className="uz-pill-arrow"><ArrowRight size={14} /></span>
            </Link>
            <a href="#capabilities" className="uz-pill uz-pill-dark">See how it works</a>
          </div>
          <div className="uz-trust">
            <span className="uz-avatars" aria-hidden>
              <i>A</i><i>M</i><i>J</i><i>+</i>
            </span>
            Trusted by 1,200+ creators and brands
          </div>
        </div>
      </section>

      {/* logo marquee */}
      <section className="uz-logos">
        <p>Trusted by teams posting to millions</p>
        <div className="uz-marquee">
          <div className="uz-track">
            {[...LOGOS, ...LOGOS, ...LOGOS].map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
        </div>
      </section>

      {/* statement */}
      <section className="uz-statement">
        <span className="uz-eyebrow">Intelligence with purpose</span>
        <h2>Strategy first. Posting second.</h2>
        <p>
          Most creators post, then hope. SOCIA flips it: the account is read, the idea is
          scored, the window is chosen, and only then does anything get posted.
        </p>
      </section>

      {/* capabilities bento */}
      <section className="uz-caps" id="capabilities">
        <div className="uz-caps-head">
          <span className="uz-eyebrow">Capabilities</span>
          <h2>An AI strategist that does the homework</h2>
          <p>Four systems working on your account every day.</p>
        </div>

        <div className="uz-bento">
          <div className="uz-card">
            <div className="uz-card-visual">
              <div className="uz-scorebars">
                {[
                  { l: "Hook", v: 92 },
                  { l: "Retention", v: 85 },
                  { l: "Relevance", v: 88 },
                  { l: "Originality", v: 78 },
                ].map((b) => (
                  <div className="uz-scorebar" key={b.l}>
                    <span>{b.l}</span>
                    <i><em style={{ width: `${b.v}%` }} /></i>
                    <b>{b.v}</b>
                  </div>
                ))}
              </div>
            </div>
            <h3>Content Score</h3>
            <p>Every idea graded on hook, retention, relevance, and originality before you film it.</p>
          </div>

          <div className="uz-card">
            <div className="uz-card-visual uz-center">
              <div className="uz-bignum">2.4<small>×</small></div>
              <span className="uz-bignum-sub">more engagement on planned posts</span>
            </div>
            <h3>Performance gains</h3>
            <p>Planned, scored posts outperform improvised ones. The gap is the product.</p>
          </div>

          <div className="uz-card">
            <div className="uz-card-visual">
              <div className="uz-ticker">
                <div className="uz-ticker-track">
                  {[
                    "@sofia synced · 12.4K followers",
                    "Reels running 6.8% engagement",
                    "Best window found · Tue 7PM",
                    "Top post: 1.9K likes · 14.5× avg",
                    "Competitor format gaining reach",
                    "@sofia synced · 12.4K followers",
                    "Reels running 6.8% engagement",
                    "Best window found · Tue 7PM",
                    "Top post: 1.9K likes · 14.5× avg",
                    "Competitor format gaining reach",
                  ].map((t, i) => (
                    <span key={i}><ScanSearch size={12} /> {t}</span>
                  ))}
                </div>
              </div>
            </div>
            <h3>Live account sync</h3>
            <p>Connect Instagram and your real numbers flow in. The plan is built on them.</p>
          </div>

          <div className="uz-card">
            <div className="uz-card-visual uz-center">
              <div className="uz-window">
                <Clock size={16} />
                <b>Tue 7PM</b>
                <span>your strongest posting window</span>
              </div>
            </div>
            <h3>Best time engine</h3>
            <p>Computed from when your own top posts actually landed, not a generic chart.</p>
          </div>
        </div>
      </section>

      {/* why */}
      <section className="uz-why" id="why">
        <div className="uz-why-left">
          <span className="uz-eyebrow">Why SOCIA</span>
          <h2>Why creators switch</h2>
          <p>Beautiful analytics are table stakes. Knowing what to do next is the product.</p>
        </div>
        <ul className="uz-why-list">
          {WHY.map((w) => (
            <li key={w}><span className="uz-check"><Check size={14} /></span>{w}</li>
          ))}
        </ul>
      </section>

      {/* values */}
      <section className="uz-values">
        {VALUES.map((v) => (
          <div className="uz-value" key={v.title}>
            <span className="uz-value-ico">{v.icon}</span>
            <h3>{v.title}</h3>
            <p>{v.body}</p>
          </div>
        ))}
      </section>

      {/* faq */}
      <section className="uz-faq-sec" id="faq">
        <div className="uz-caps-head">
          <span className="uz-eyebrow">Questions</span>
          <h2>Answers before you ask</h2>
        </div>
        <UzFaq />
      </section>

      {/* closing cta */}
      <section className="uz-cta">
        <div className="uz-silk small" aria-hidden>
          <i className="s1" /><i className="s2" />
        </div>
        <h2>Grow on purpose.</h2>
        <p>Connect your account and see your first plan in under two minutes.</p>
        <Link href="/signup" className="uz-pill uz-pill-light big">
          Start your 7-day free trial <span className="uz-pill-arrow"><ArrowRight size={15} /></span>
        </Link>
        <span className="uz-cta-note"><Gauge size={13} /> No card required to look around</span>
      </section>

      {/* footer */}
      <footer className="uz-footer">
        <span className="uz-brand"><span className="side-mark">S</span> SOCIA</span>
        <nav>
          <a href="#capabilities">Capabilities</a>
          <a href="#why">Why SOCIA</a>
          <a href="#faq">FAQ</a>
          <Link href="/login">Log in</Link>
        </nav>
        <span className="uz-copy">© 2026 SOCIA. All rights reserved.</span>
      </footer>
    </div>
  );
}

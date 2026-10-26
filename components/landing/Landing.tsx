import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { PlatformMark, type Platform } from "@/components/system";
import { PLANS, type PlanId } from "@/lib/plans";
import EngineFrame from "./EngineFrame";
import Opening from "./Opening";
import Tear from "./Tear";
import Chrome from "./Chrome";
import Reveal from "./Reveal";
import StudioDemo from "./StudioDemo";
import Strategist from "./Strategist";
import Faq from "./Faq";
import Tilt from "./Tilt";
import CloseMark from "./CloseMark";
import { INTRO_FLAG } from "./introFlag";
import "./landing.css";

// SOCIA's public homepage: the live site's story (promise, problem, engine,
// strategist, loop, results, start) told the way the reference tells it
// (library/references/nothin.md), in monochrome with one gold accent. The
// product mockups illustrate each feature and say so.

const INTRO_SCRIPT = `(function(){try{var d=document.documentElement;if(matchMedia("(prefers-reduced-motion: reduce)").matches||sessionStorage.getItem("${INTRO_FLAG}"))return;d.setAttribute("data-lp-intro","play");setTimeout(function(){if(d.getAttribute("data-lp-intro")==="play")d.removeAttribute("data-lp-intro")},4000)}catch(e){}})();`;

const PLATFORMS: Platform[] = ["instagram", "facebook", "youtube", "tiktok"];
const PLATFORM_NAME: Record<Platform, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" };
const PLAN_ORDER: PlanId[] = ["free", "starter", "growth", "pro"];

const PROBLEMS = [
  { name: "No clear strategy", line: "Posting without a plan creates inconsistent results.", fig: "Posting activity, four weeks: 2, 0, 3, 1" },
  { name: "Wrong content", line: "Guessing what works wastes time and reach.", fig: "Content fit: low. 4 of 6 posts under your median" },
  { name: "Missed opportunities", line: "Winning formats and topics are often visible before creators notice them.", fig: "Educational Reels: +68% niche momentum, unused" },
  { name: "Falling behind", line: "Competitors learn faster while you're still interpreting yesterday's analytics.", fig: "2 outlier competitor posts this week" },
];

const LOOP = [
  { name: "Audit", line: "See what's working now." },
  { name: "Plan", line: "Build your next strategy." },
  { name: "Create", line: "Create content that connects." },
  { name: "Score", line: "Predict before you post." },
  { name: "Publish", line: "Post at the right moment." },
  { name: "Measure", line: "See what actually worked." },
  { name: "Learn", line: "Turn results into intelligence." },
];

const WITHOUT = ["Guess what to post", "Manually research competitors", "Check multiple analytics dashboards", "Post whenever", "React after performance drops", "Repeat"];
const WITH = ["Know what to post", "See opportunities automatically", "Understand why content performs", "Publish at optimal times", "Score content before posting", "Improve every week"];

export default function Landing() {
  const year = new Date().getFullYear();

  return (
    <div className="lp-root" data-theme="dark">
      <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      <Chrome />

      {/* -------------------------------------------------- 01 promise */}
      <Opening />

      <main>
        {/* ------------------------------------------------ 02 problem: the tear */}
        <Tear screens={[<EngineFrame key="engine" />, <StudioDemo key="studio" />, <Strategist key="ask" />]}>
          <div className="lp-wrap">
            <h2 id="h-problem" className="lp-statement">Posting shouldn&apos;t <em>be guesswork.</em></h2>
            <hr className="lp-statement-rule" />
            <p className="lp-prose">
              Creators produce more content than ever, but most still decide with instinct, outdated analytics, and
              whatever happened to work last week. <b>SOCIA turns those signals into decisions.</b>
            </p>
          </div>
        </Tear>

        <section className="lp-band is-paper" aria-label="The four problems">
          <Reveal as="div">
            <ul className="lp-facts" aria-label="What goes wrong without a plan">
              {PROBLEMS.map((p) => (
                <li key={p.name}>
                  <b>{p.name}</b>
                  <span>{p.line}</span>
                  <span className="lp-fact-fig">{p.fig}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="lp-after-facts" words>
            <p className="lp-statement is-small">SOCIA connects the dots others miss.</p>
            <p className="lp-prose">From scattered signals to smart, confident decisions.</p>
          </Reveal>
        </section>

        {/* ------------------------------------------------ 03 engine */}
        <section className="lp-band" id="chapter-3" aria-labelledby="h-engine">
          <div className="lp-two">
            <Reveal words>
              <h2 id="h-engine" className="lp-statement">Everything from audit <em>to your next move.</em></h2>
              <hr className="lp-statement-rule" />
            </Reveal>
            <Reveal className="lp-two-stack">
              <p className="lp-label">The SOCIA intelligence engine</p>
              <p className="lp-prose">
                SOCIA watches your content, competitors, audience, and performance. Then it turns those signals into the
                next thing you should do.
              </p>
            </Reveal>
          </div>
          <Reveal as="div" className="lp-bleed">
            <Tilt><EngineFrame /></Tilt>
          </Reveal>
          <Reveal className="lp-after-screen" words>
            <p className="lp-statement is-small">One system. Smarter every week.</p>
            <p className="lp-prose">More signals. Better decisions. Bigger results.</p>
          </Reveal>
        </section>

        {/* ------------------------------------------------ 04 strategist */}
        <section className="lp-band is-paper" id="chapter-4" aria-labelledby="h-ask">
          <div className="lp-two">
            <Reveal words>
              <h2 id="h-ask" className="lp-statement">Ask SOCIA anything <em>about your content.</em></h2>
              <hr className="lp-statement-rule" />
            </Reveal>
            <Reveal className="lp-two-stack">
              <p className="lp-label">AI strategist</p>
              <p className="lp-prose">
                Instant, data-backed answers based on your account, audience, competitors, and performance.
                <b> SOCIA isn&apos;t guessing. It&apos;s reasoning from your data.</b> Try the three questions.
              </p>
            </Reveal>
          </div>
          <Reveal as="div" className="lp-bleed">
            <Tilt><Strategist /></Tilt>
          </Reveal>
        </section>

        {/* ------------------------------------------------ 05 loop */}
        <section className="lp-band is-charcoal" id="chapter-5" aria-labelledby="h-loop">
          <div className="lp-two">
            <Reveal words>
              <h2 id="h-loop" className="lp-statement">A system that <em>compounds every week.</em></h2>
              <hr className="lp-statement-rule" />
            </Reveal>
            <Reveal className="lp-two-stack">
              <p className="lp-label">The SOCIA loop</p>
              <p className="lp-prose">Every post creates another signal. Every signal makes SOCIA smarter.</p>
            </Reveal>
          </div>
          <Reveal as="div">
            <ol className="lp-chain is-dark is-seven" aria-label="The loop">
              {LOOP.map((c, i) => (
                <li key={c.name}>
                  <p className="lp-label">{String(i + 1).padStart(2, "0")}</p>
                  <h3>{c.name}</h3>
                  <p>{c.line}</p>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal as="div" className="lp-bleed">
            <Tilt><StudioDemo /></Tilt>
          </Reveal>
          <Reveal className="lp-after-screen">
            <p className="lp-label">Content Studio</p>
            <p className="lp-prose">Upload the clips from a shoot. SOCIA suggests the cut and the caption, and you render it in your browser. <b>Try it: choose which clips make the cut.</b></p>
          </Reveal>
        </section>

        {/* ------------------------------------------------ 06 results */}
        <section className="lp-band is-paper" id="chapter-6" aria-labelledby="h-results">
          <div className="lp-two">
            <Reveal words>
              <h2 id="h-results" className="lp-statement">Better decisions <em>compound.</em></h2>
              <hr className="lp-statement-rule" />
            </Reveal>
            <Reveal className="lp-two-stack">
              <p className="lp-label">Before and after SOCIA</p>
              <p className="lp-prose">From scattered signals to clear next moves. SOCIA turns your content data into decisions you can act on.</p>
            </Reveal>
          </div>
          <Reveal as="div">
            <div className="lp-ba">
              <div className="lp-ba-col">
                <p className="lp-label">Without SOCIA</p>
                <ol>{WITHOUT.map((t) => <li key={t}>{t}</li>)}</ol>
              </div>
              <div className="lp-ba-col is-with">
                <p className="lp-label">With SOCIA</p>
                <ol>{WITH.map((t) => <li key={t}>{t}</li>)}</ol>
              </div>
            </div>
          </Reveal>
          <Reveal as="div" className="lp-after-screen">
            <div className="lp-works">
              <span>Connect the accounts you already post from</span>
              <ul>{PLATFORMS.map((p) => <li key={p}><PlatformMark platform={p} />{PLATFORM_NAME[p]}</li>)}</ul>
            </div>
          </Reveal>
        </section>

        {/* ------------------------------------------------ 07 start */}
        <section className="lp-band" id="chapter-7" aria-labelledby="h-plans">
          <div className="lp-two">
            <Reveal words>
              <h2 id="h-plans" className="lp-statement">Start free, upgrade <em>when you add brands.</em></h2>
              <hr className="lp-statement-rule" />
            </Reveal>
            <Reveal className="lp-two-stack">
              <p className="lp-label">Plans</p>
              <p className="lp-prose">No credit card. Cancel anytime. <Link href="/pricing" className="lp-link">Compare every plan</Link>.</p>
            </Reveal>
          </div>
          <Reveal as="div">
            <div className="lp-plans">
              {PLAN_ORDER.map((id) => (
                <div key={id} className="lp-plan">
                  <h3>{PLANS[id].name}</h3>
                  <p className="lp-price">${PLANS[id].priceMonthly}<small> a month</small></p>
                  <p>{PLANS[id].tagline}</p>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal as="div" className="lp-after-screen">
            <Faq />
          </Reveal>
        </section>

        <section className="lp-close" aria-labelledby="h-close">
          <div className="lp-close-top">
            <Reveal words>
              <h2 id="h-close" className="lp-statement">Stop guessing. <em>Start knowing.</em></h2>
              <hr className="lp-statement-rule" />
            </Reveal>
            <Reveal className="lp-two-stack">
              <p className="lp-prose">Better content starts with better decisions. Connect an account and SOCIA starts from your own numbers.</p>
              <div className="lp-open-actions">
                <Link href="/signup" className="lp-btn is-filled">Get started free</Link>
                <Link href="/pricing" className="lp-btn">See plans</Link>
              </div>
            </Reveal>
          </div>
          <CloseMark />
        </section>

        <footer className="lp-footer">
          <div className="lp-footer-brand"><BrandMark size={20} /><span>SOCIA. Know what to do next.</span></div>
          <nav aria-label="Footer">
            <Link href="/pricing">Pricing</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/data-deletion">Data deletion</Link>
            <Link href="/login">Log in</Link>
            <Link href="/signup">Sign up</Link>
          </nav>
          <span>&copy; {year} SOCIA</span>
        </footer>
      </main>
    </div>
  );
}

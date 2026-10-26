import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { PlatformMark, type Platform } from "@/components/system";
import { PLANS, type PlanId } from "@/lib/plans";
import { landingAssets } from "@/lib/landingAssets";
import Opening from "./Opening";
import Tear from "./Tear";
import Chaos from "./Chaos";
import Engine from "./Engine";
import Chrome from "./Chrome";
import Reveal from "./Reveal";
import StudioDemo from "./StudioDemo";
import Strategist from "./Strategist";
import Loop from "./Loop";
import Compare from "./Compare";
import Faq from "./Faq";
import Tilt from "./Tilt";
import CloseMark from "./CloseMark";
import { INTRO_FLAG } from "./introFlag";
import "./landing.css";

// SOCIA's public homepage, one directed sequence: the name; the reveal (data,
// understanding, action); the problem, felt; how SOCIA thinks; from clips to
// content; a conversation; the loop; before and after; start. Monochrome, in
// deliberate bands (black for confidence and focus, paper for reading,
// charcoal for continuity), gold for one line at a time. Every product
// screen is an example and says so.

const INTRO_SCRIPT = `(function(){try{var d=document.documentElement;if(matchMedia("(prefers-reduced-motion: reduce)").matches||sessionStorage.getItem("${INTRO_FLAG}"))return;d.setAttribute("data-lp-intro","play");setTimeout(function(){if(d.getAttribute("data-lp-intro")==="play")d.removeAttribute("data-lp-intro")},6000)}catch(e){}})();`;

const PLATFORMS: Platform[] = ["instagram", "facebook", "youtube", "tiktok"];
const PLATFORM_NAME: Record<Platform, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" };
const PLAN_ORDER: PlanId[] = ["free", "starter", "growth", "pro"];

export default function Landing() {
  const year = new Date().getFullYear();
  const assets = landingAssets();

  return (
    <div className="lp-root" data-theme="dark">
      <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      <Chrome />

      {/* ---------------------------------------------- 01 the name (black) */}
      <Opening footage={assets.opening} />

      <main>
        {/* -------------------------------------------- 02 the reveal (black) */}
        <Tear>
          <div className="lp-wrap">
            <h2 id="h-problem" className="lp-statement">Posting shouldn&apos;t <em>be guesswork.</em></h2>
            <hr className="lp-statement-rule" />
            <p className="lp-prose">
              Creators produce more content than ever, but most still decide with instinct, outdated analytics, and
              whatever happened to work last week. <b>SOCIA turns those signals into decisions.</b>
            </p>
          </div>
        </Tear>

        {/* -------------------------------------------- 03 the problem, felt (paper) */}
        <Chaos />
        <section className="lp-band is-paper is-short" aria-label="What SOCIA does with the signals">
          <Reveal className="lp-after-facts" words>
            <p className="lp-statement is-small">SOCIA connects the dots others miss.</p>
            <p className="lp-prose">From scattered signals to smart, confident decisions.</p>
          </Reveal>
        </section>

        {/* -------------------------------------------- 04 how SOCIA thinks (black) */}
        <section className="lp-band" id="chapter-4" aria-labelledby="h-engine">
          <div className="lp-two">
            <Reveal words>
              <h2 id="h-engine" className="lp-statement">Everything from audit <em>to your next move.</em></h2>
              <hr className="lp-statement-rule" />
            </Reveal>
            <Reveal className="lp-two-stack">
              <p className="lp-label">The SOCIA intelligence engine</p>
              <p className="lp-prose">
                SOCIA watches your content, competitors, audience, and performance. Then it turns those signals into the
                next thing you should do. One post, read the way SOCIA reads it:
              </p>
            </Reveal>
          </div>
          <Engine />
          <Reveal className="lp-after-screen" words>
            <p className="lp-statement is-small">One system. Smarter every week.</p>
            <p className="lp-prose">More signals. Better decisions. Bigger results.</p>
          </Reveal>
        </section>

        {/* -------------------------------------------- 05 from clips to content (black) */}
        <section className="lp-band" id="chapter-5" aria-labelledby="h-studio">
          <div className="lp-two">
            <Reveal words>
              <h2 id="h-studio" className="lp-statement">From clips <em>to content.</em></h2>
              <hr className="lp-statement-rule" />
            </Reveal>
            <Reveal className="lp-two-stack">
              <p className="lp-label">Content Studio</p>
              <p className="lp-prose">
                Upload the clips from a shoot. SOCIA suggests the cut, the edit and the caption, and you render it in
                your browser. <b>Try it: choose which clips make the cut.</b>
              </p>
            </Reveal>
          </div>
          <Reveal as="div" className="lp-bleed">
            <Tilt><StudioDemo stills={assets.clips} /></Tilt>
          </Reveal>
        </section>

        {/* -------------------------------------------- 06 a conversation (paper) */}
        <section className="lp-band is-paper" id="chapter-6" aria-labelledby="h-ask">
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

        {/* -------------------------------------------- 07 the loop (charcoal) */}
        <section className="lp-band is-charcoal" id="chapter-7" aria-labelledby="h-loop">
          <div className="lp-two">
            <Reveal words>
              <h2 id="h-loop" className="lp-statement">A system that <em>compounds every week.</em></h2>
              <hr className="lp-statement-rule" />
            </Reveal>
            <Reveal className="lp-two-stack">
              <p className="lp-label">The SOCIA loop</p>
              <p className="lp-prose">Every post creates another signal. Every signal makes SOCIA smarter. Seven stages, and the last one points back to the first.</p>
            </Reveal>
          </div>
          <Reveal as="div">
            <Loop />
          </Reveal>
        </section>

        {/* -------------------------------------------- 08 before and after (paper) */}
        <section className="lp-band is-paper" id="chapter-8" aria-labelledby="h-results">
          <div className="lp-two">
            <Reveal words>
              <h2 id="h-results" className="lp-statement">Better decisions <em>compound.</em></h2>
              <hr className="lp-statement-rule" />
            </Reveal>
            <Reveal className="lp-two-stack">
              <p className="lp-label">Before and after SOCIA</p>
              <p className="lp-prose">The same signals, in five apps or in one. Wipe across to compare.</p>
            </Reveal>
          </div>
          <Reveal as="div">
            <Compare />
          </Reveal>
          <Reveal as="div" className="lp-after-screen">
            <div className="lp-works">
              <span>Connect the accounts you already post from</span>
              <ul>{PLATFORMS.map((p) => <li key={p}><PlatformMark platform={p} />{PLATFORM_NAME[p]}</li>)}</ul>
            </div>
          </Reveal>
        </section>

        {/* -------------------------------------------- 09 start (black) */}
        <section className="lp-band" id="chapter-9" aria-labelledby="h-plans">
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

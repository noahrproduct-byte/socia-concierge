import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { PlatformMark, type Platform } from "@/components/system";
import HeroFrame from "./HeroFrame";
import Opening from "./Opening";
import Chrome from "./Chrome";
import Reveal from "./Reveal";
import StudioDemo from "./StudioDemo";
import Explore from "./Explore";
import { INTRO_FLAG } from "./introFlag";
import "./landing.css";

// SOCIA's public homepage, told in seven chapters on alternating black and
// paper bands. The reference and the reasons are in
// .claude/skills/world-class-web-design-intelligence/library/references/nothin.md.
// Every claim below is something the product does today; every number sits
// in a screen labelled "Example data" (docs/design/anti-slop-standard.md).

/**
 * Runs before paint: sets the opening sequence's start state only when it is
 * going to play (first visit this session, motion allowed). If the page's
 * JavaScript never takes over, the start state is lifted after 4 seconds so
 * the finished first screen still shows.
 */
const INTRO_SCRIPT = `(function(){try{var d=document.documentElement;if(matchMedia("(prefers-reduced-motion: reduce)").matches||sessionStorage.getItem("${INTRO_FLAG}"))return;d.setAttribute("data-lp-intro","play");setTimeout(function(){if(d.getAttribute("data-lp-intro")==="play")d.removeAttribute("data-lp-intro")},4000)}catch(e){}})();`;

const PLATFORMS: { id: Platform; name: string; gives: string; lacks: string }[] = [
  { id: "instagram", name: "Instagram", gives: "Views, reach, interactions and followers, per post and per day.", lacks: "Says nothing about which post to make next." },
  { id: "facebook", name: "Facebook", gives: "Page views, follows and post engagement.", lacks: "Reports yesterday, never today." },
  { id: "youtube", name: "YouTube", gives: "Views, watch time and subscribers, with a day or two of lag.", lacks: "Treats every video the same." },
  { id: "tiktok", name: "TikTok", gives: "Account and per-video totals.", lacks: "No daily series, no audience breakdown, by its own API." },
];

const CHAIN = [
  { name: "Content plan", line: "A week of posts, each one tied to the posts it came from." },
  { name: "Create post", line: "One caption and one video, with each platform's own settings." },
  { name: "Calendar", line: "Scheduled, published and failed, in one week view." },
  { name: "Publishing", line: "Instagram, Facebook and YouTube go out; TikTok lands in your inbox as a draft." },
  { name: "Analytics", line: "The result comes back into next week's plan." },
];

export default function Landing() {
  const year = new Date().getFullYear();

  return (
    <div className="lp-root" data-theme="dark">
      <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      <Chrome />

      {/* -------------------------------------------------- 01 introduction */}
      <Opening screen={<HeroFrame />} />

      <main>
        {/* ------------------------------------------------ 02 the problem */}
        <section className="lp-band is-paper" id="chapter-2" aria-labelledby="h-problem">
          <div className="lp-two">
            <Reveal>
              <h2 id="h-problem" className="lp-statement">More data. <em>Less direction.</em></h2>
              <hr className="lp-statement-rule" />
            </Reveal>
            <Reveal className="lp-two-stack">
              <p className="lp-label">The problem</p>
              <p className="lp-prose">
                Every platform hands you numbers. None of them tells you what to do on Thursday. SOCIA reads the same
                numbers and answers that one question: <b>what should the next post be, and when?</b>
              </p>
            </Reveal>
          </div>
          <Reveal as="div">
            <ul className="lp-facts" aria-label="What each platform reports">
              {PLATFORMS.map((p) => (
                <li key={p.id}>
                  <b><PlatformMark platform={p.id} size="sm" />{p.name}</b>
                  <span>{p.gives}</span>
                  <span>{p.lacks}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        {/* ------------------------------------------------ 03 intelligence */}
        <section className="lp-band" id="chapter-3" aria-labelledby="h-intel">
          <div className="lp-two">
            <Reveal>
              <h2 id="h-intel" className="lp-statement">Understand. <em>Decide.</em> Post.</h2>
              <hr className="lp-statement-rule" />
            </Reveal>
            <Reveal className="lp-two-stack">
              <p className="lp-label">Intelligence</p>
              <p className="lp-prose">
                Three steps, every week, from the account&apos;s own history. SOCIA says how many posts each conclusion
                rests on, and when the sample is too small to trust.
              </p>
            </Reveal>
          </div>
          <Reveal as="div">
            <ol className="lp-steps">
              <li>
                <h3>Understand performance</h3>
                <p>Every metric the platforms report, over any window, with the previous period beside it.</p>
                <div className="lp-mini-screen">
                  <ul>
                    <li><b>Views</b><span>50.1K, +14% vs prior 30 days</span></li>
                    <li><b>Reach</b><span>22.5K, +9%</span></li>
                    <li><b>Interactions</b><span>2,270, -4%</span></li>
                  </ul>
                </div>
              </li>
              <li>
                <h3>Identify what matters</h3>
                <p>What changed, and which of your posts caused it. Formats, timing, and the outliers.</p>
                <div className="lp-mini-screen">
                  <ul>
                    <li><b>Reels</b><span>9 of 14 posts, 71% of views</span></li>
                    <li><b>Thursday 6 to 8pm</b><span>strongest window, 12 weeks</span></li>
                    <li><b>Carousels</b><span>saved less than in September</span></li>
                  </ul>
                </div>
              </li>
              <li>
                <h3>Know what to do next</h3>
                <p>One concrete next post, with the sample it rests on, checked again the following week.</p>
                <div className="lp-mini-screen">
                  <p className="lp-next-line">
                    Post a Reel on Thursday at 7pm.
                    <small>Based on 14 of your posts. A small sample, so SOCIA checks it again next week.</small>
                  </p>
                </div>
              </li>
            </ol>
          </Reveal>
          <Reveal as="div" className="lp-bleed">
            <HeroFrame />
          </Reveal>
        </section>

        {/* ------------------------------------------------ 04 content studio */}
        <section className="lp-band is-paper" id="chapter-4" aria-labelledby="h-studio">
          <div className="lp-two">
            <Reveal>
              <h2 id="h-studio" className="lp-statement">From raw clips <em>to a clear plan.</em></h2>
              <hr className="lp-statement-rule" />
            </Reveal>
            <Reveal className="lp-two-stack">
              <p className="lp-label">Content Studio</p>
              <p className="lp-prose">
                Upload the clips from a shoot. SOCIA reads what they show and say, suggests a cut and a caption, and
                you render it in your browser. <b>Try it: choose which clips make the cut.</b>
              </p>
            </Reveal>
          </div>
          <Reveal as="div" className="lp-bleed">
            <StudioDemo />
          </Reveal>
        </section>

        {/* ------------------------------------------------ 05 planning and publishing */}
        <section className="lp-band is-charcoal" id="chapter-5" aria-labelledby="h-plan">
          <div className="lp-two">
            <Reveal>
              <h2 id="h-plan" className="lp-statement">An idea is only <em>the beginning.</em></h2>
              <hr className="lp-statement-rule" />
            </Reveal>
            <Reveal className="lp-two-stack">
              <p className="lp-label">Planning and publishing</p>
              <p className="lp-prose">
                A plan becomes a post, the post goes out, and what happened comes back into the next plan. Five parts
                of SOCIA, one loop.
              </p>
            </Reveal>
          </div>
          <Reveal as="div">
            <ol className="lp-chain is-dark" aria-label="The loop">
              {CHAIN.map((c, i) => (
                <li key={c.name}>
                  <p className="lp-label">{String(i + 1).padStart(2, "0")}</p>
                  <h3>{c.name}</h3>
                  <p>{c.line}</p>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal as="div" className="lp-bleed is-right">
            <div className="lp-screen" data-theme="light" role="img" aria-label="Example: the post composer with four destinations and their status">
              <div className="lp-screen-top">
                <BrandMark size={18} />
                <b>Create post</b>
                <span>Scheduled for Thu, Oct 30, 7:00pm</span>
                <em className="lp-example">Example data</em>
              </div>
              <div className="lp-screen-body">
                <span className="lp-studio-meta">Destinations</span>
                <ul className="lp-dests">
                  <li><PlatformMark platform="instagram" brand /><span>Instagram Reel<small>Also shared to the feed</small></span><span>Scheduled</span></li>
                  <li><PlatformMark platform="youtube" brand /><span>YouTube Short<small>Public at 7:00pm</small></span><span>Scheduled</span></li>
                  <li><PlatformMark platform="facebook" brand /><span>Facebook Page<small>Same caption</small></span><span>Scheduled</span></li>
                  <li><PlatformMark platform="tiktok" brand /><span>TikTok<small>Arrives in your TikTok inbox as a draft</small></span><span>Draft</span></li>
                </ul>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ------------------------------------------------ 06 explore */}
        <section className="lp-band" id="chapter-6" aria-labelledby="h-explore">
          <div className="lp-two">
            <Reveal>
              <h2 id="h-explore" className="lp-statement">Everything <em>around the post.</em></h2>
              <hr className="lp-statement-rule" />
            </Reveal>
            <Reveal className="lp-two-stack">
              <p className="lp-label">Explore</p>
              <p className="lp-prose">For one creator, a small team, or an agency running several brands.</p>
            </Reveal>
          </div>
          <Reveal as="div">
            <Explore
              items={[
                { id: "analytics", name: "Analytics", line: "Every platform's numbers, with the previous period beside them and the sample size on every claim.", excerpt: (
                  <ul><li><b>Followers</b><span>3,912, +86 vs prior 30 days</span></li><li><b>Reach, last 7 days</b><span>Needs 5 posts; you have 2</span></li></ul>
                ) },
                { id: "competitors", name: "Competitors", line: "What the accounts you follow post, how often, and which of their posts took off.", excerpt: (
                  <ul><li><b>Bakery across town</b><span>5 posts a week</span></li><li><b>Café near campus</b><span>3 posts a week</span></li><li><b>Roastery downtown</b><span>1 post a week</span></li></ul>
                ) },
                { id: "studio", name: "Content Studio", line: "Clips in, a suggested cut and caption out, rendered in your browser.", excerpt: (
                  <ul><li><b>5 clips uploaded</b><span>Done</span></li><li><b>Cuts suggested for this week</b><span>3 ready</span></li></ul>
                ) },
                { id: "plan", name: "Content planning", line: "A weekly plan from your own results, every idea traceable to the posts it came from.", excerpt: (
                  <ul><li><b>Thu</b><span>Reel: the new seasonal menu</span></li><li><b>Why</b><span>Thursday evening is your strongest window (14 posts)</span></li></ul>
                ) },
                { id: "publish", name: "Publishing", line: "Instagram, Facebook and YouTube from one post; approvals for teams; TikTok as a draft.", excerpt: (
                  <ul><li><b>Seasonal menu Reel</b><span>Waiting for approval</span></li><li><b>Submitted by a teammate</b><span>Today</span></li></ul>
                ) },
                { id: "ask", name: "Ask SOCIA", line: "Questions answered from your own data, with the source on every answer. Also from Claude or ChatGPT.", excerpt: (
                  <ul><li><b>Why a Reel on Thursday?</b><span></span></li><li><span>Your 14 Thursday Reels averaged 1,840 views; the others 1,120. Instagram, Jul 28 to Oct 20.</span><span></span></li></ul>
                ) },
              ]}
            />
          </Reveal>
        </section>

        {/* ------------------------------------------------ 07 start */}
        <section className="lp-close" id="chapter-7" aria-labelledby="h-close">
          <div className="lp-close-top">
            <Reveal>
              <h2 id="h-close" className="lp-statement">Stop guessing. <em>Start knowing.</em></h2>
              <hr className="lp-statement-rule" />
            </Reveal>
            <Reveal className="lp-two-stack">
              <p className="lp-prose">Connect Instagram, Facebook, YouTube or TikTok. SOCIA starts from your own numbers. Free to start.</p>
              <div className="lp-open-actions">
                <Link href="/signup" className="lp-btn is-filled">Get started free</Link>
                <Link href="/pricing" className="lp-btn">See plans</Link>
              </div>
            </Reveal>
          </div>
          <p className="lp-close-mark" aria-hidden="true"><span>SOCIA</span></p>
        </section>

        <footer className="lp-footer">
          <span>&copy; {year} SOCIA. Know what to do next.</span>
          <nav aria-label="Footer">
            <Link href="/pricing">Pricing</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/data-deletion">Data deletion</Link>
            <Link href="/login">Log in</Link>
            <Link href="/signup">Sign up</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}

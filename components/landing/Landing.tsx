import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { ButtonLink, KpiCell, PlatformMark, type Platform } from "@/components/system";
import { PLANS, type PlanId } from "@/lib/plans";
import HeroFrame from "./HeroFrame";
import "./landing.css";

// SOCIA's public homepage. First screen: the wordmark on cobalt, the brand's
// one bold moment. Then a charcoal canvas where SOCIA's own screens make the
// case: what changed, what to post, how it gets made and published, and the
// tools around it. Every claim is something the product does today; every
// number sits inside a frame labelled "Example data". Built against
// docs/design/anti-slop-standard.md and the frontend-design guidance.

const PLATFORMS: Platform[] = ["instagram", "facebook", "youtube", "tiktok"];
const PLATFORM_LABEL: Record<Platform, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" };
const PLAN_ORDER: PlanId[] = ["free", "starter", "growth", "pro"];

/** A static product frame: a picture of the app, so its controls are not interactive. */
function Frame({ title, context, label, children }: { title: string; context: string; label: string; children: React.ReactNode }) {
  return (
    <div className="lp-frame" data-theme="light" role="img" aria-label={`Example: ${label}`}>
      <div className="lp-frame-top">
        <BrandMark size={18} />
        <b>{title}</b>
        <span>{context}</span>
        <em className="lp-example">Example data</em>
      </div>
      <div className="lp-frame-body">{children}</div>
    </div>
  );
}

function Pair({ frame, side, title, text }: { frame: React.ReactNode; side: React.ReactNode; title: string; text: string }) {
  return (
    <div className="lp-pair">
      <div className="lp-pair-main">
        <div className="lp-pair-stage">{frame}</div>
        <div className="lp-caption">
          <h3>{title}</h3>
          <p>{text}</p>
        </div>
      </div>
      <aside className="lp-side">{side}</aside>
    </div>
  );
}

export default function Landing() {
  const year = new Date().getFullYear();

  return (
    <div className="lp-root" data-theme="dark">
      {/* ---------------------------------------------------------------- the brand */}
      <section className="lp-intro" aria-label="SOCIA">
        <nav className="lp-intro-nav" aria-label="Main">
          <Link href="/" aria-label="SOCIA home"><BrandMark size={32} /></Link>
          <div className="lp-intro-links">
            <Link href="/pricing" className="lp-intro-link">Pricing</Link>
            <Link href="/login" className="lp-intro-link">Log in</Link>
            <Link href="/signup" className="lp-ink-btn">Start free</Link>
          </div>
        </nav>
        <p className="lp-mark" aria-hidden="true">SOCIA</p>
        <div className="lp-intro-foot">
          <p className="lp-promise">Know what to do next.</p>
          <ul className="lp-platform-list" aria-label="Works with">
            {PLATFORMS.map((p) => (
              <li key={p}><PlatformMark platform={p} size="sm" />{PLATFORM_LABEL[p]}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------------- the canvas */}
      <header className="lp-bar">
        <div className="lp-wrap lp-bar-in">
          <Link href="/" className="lp-brand"><BrandMark size={22} />SOCIA</Link>
          <div className="lp-bar-links">
            <Link href="/pricing" className="lp-bar-link">Pricing</Link>
            <Link href="/login" className="lp-bar-link">Log in</Link>
            <ButtonLink href="/signup" variant="primary" size="sm">Start free</ButtonLink>
          </div>
        </div>
      </header>

      <main className="lp-wrap">
        <section className="lp-hero">
          <h1 className="lp-h1">SOCIA reads your accounts and tells you what to post next.</h1>
          <p className="lp-lede">
            It pulls the real numbers from Instagram, Facebook, YouTube and TikTok, builds a weekly plan from what
            worked for you, and helps you make, schedule and publish each post. When there isn&apos;t enough data to
            say something, it says that instead.
          </p>
          <div className="lp-actions">
            <div className="lp-actions-main">
              <ButtonLink href="/signup" variant="primary" size="lg">Start free</ButtonLink>
              <ButtonLink href="/pricing" variant="secondary" size="lg">See plans</ButtonLink>
            </div>
            <a href="#assistants" className="lp-news"><b>New:</b> <span>use SOCIA from Claude or ChatGPT</span></a>
          </div>
          <HeroFrame />
        </section>

        <div className="lp-works">
          <span>Connect the accounts you already post from</span>
          <ul>
            {PLATFORMS.map((p) => (
              <li key={p}><PlatformMark platform={p} />{PLATFORM_LABEL[p]}</li>
            ))}
          </ul>
        </div>

        {/* ------------------------------------------------------------ the loop */}
        <section className="lp-section" aria-labelledby="lp-loop">
          <div className="lp-section-head">
            <div>
              <h2 id="lp-loop" className="lp-h2">From your numbers to your next post</h2>
              <p className="lp-h2-sub">Plan, make and publish in one place, with every suggestion tied to the posts it came from.</p>
            </div>
            <ButtonLink href="/signup" variant="secondary">Start free</ButtonLink>
          </div>

          <Pair
            title="Plan the week from what worked"
            text="Each idea in the weekly plan says which of your posts it comes from. Change anything, then send a day to the calendar."
            frame={
              <Frame title="Content plan" context="Week of Oct 27" label="a weekly content plan with the reason for each post">
                <table className="lp-table">
                  <thead>
                    <tr><th>Day</th><th>Post</th><th>Format</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>Mon</td><td>Behind the counter at opening<span className="lp-why">Your two best Reels in October were filmed before opening.</span></td><td>Reel</td></tr>
                    <tr><td>Wed</td><td>Three questions customers ask most<span className="lp-why">Carousels with questions were saved twice as often as other carousels.</span></td><td>Carousel</td></tr>
                    <tr><td>Thu</td><td>The new seasonal menu, start to finish<span className="lp-why">Thursday evening is your strongest window (14 posts).</span></td><td>Reel</td></tr>
                    <tr><td>Sat</td><td>Weekend hours and what&apos;s on<span className="lp-why">Short photo posts on Saturday keep reach steady.</span></td><td>Image</td></tr>
                  </tbody>
                </table>
              </Frame>
            }
            side={
              <>
                <span className="lp-side-title">Ask SOCIA</span>
                <div className="lp-ask">Why a Reel on Thursday?</div>
                <p className="lp-answer">
                  Your <b>14 Reels posted on Thursdays between 6 and 8pm</b> averaged 1,840 views. Your other Reels
                  averaged 1,120. It is a small sample, so next week&apos;s plan checks it again.
                </p>
                <p className="lp-source">Instagram, Jul 28 to Oct 20. Example data.</p>
              </>
            }
          />

          <Pair
            title="Turn a shoot into finished posts"
            text="Upload the clips from a shoot. SOCIA suggests cuts, captions and on-screen text from what it hears and sees; you edit the cut and render it in your browser."
            frame={
              <Frame title="Content Studio" context="Seasonal menu shoot" label="Content Studio with uploaded clips, a suggested cut and its caption">
                <div className="lp-studio">
                  <ul className="lp-clips" aria-label="Clips">
                    <li className="is-used"><span>Pouring</span><span>0:14</span></li>
                    <li className="is-used"><span>Plating</span><span>0:22</span></li>
                    <li><span>Counter wide</span><span>0:41</span></li>
                    <li className="is-used"><span>First bite</span><span>0:09</span></li>
                    <li><span>Menu board</span><span>0:18</span></li>
                  </ul>
                  <div>
                    <span className="lp-label">Suggested cut, 24 seconds: three of your five clips</span>
                    <div className="lp-cut" aria-hidden="true">
                      <span style={{ flex: 5 }}>Pouring</span>
                      <span style={{ flex: 12 }}>Plating</span>
                      <span style={{ flex: 7 }}>First bite</span>
                    </div>
                    <span className="lp-label">Caption draft</span>
                    <p className="lp-draft">The autumn menu is here. Four new plates, one first bite. In store from Thursday.</p>
                  </div>
                </div>
              </Frame>
            }
            side={
              <>
                <span className="lp-side-title">Studio project</span>
                <ul className="lp-steps">
                  <li><span>5 clips uploaded</span><span>Done</span></li>
                  <li><span>Speech and shots read</span><span>Done</span></li>
                  <li><span>Cuts suggested for this week&apos;s plan</span><span>3 ready</span></li>
                  <li><span>Rendered in your browser</span><span>When you choose</span></li>
                </ul>
                <p className="lp-source">Raw clips are kept for your plan&apos;s retention period, then removed. Finished videos stay with their posts.</p>
              </>
            }
          />

          <Pair
            title="Publish everywhere from one post"
            text="One caption and one video, with the settings each platform needs. SOCIA checks every destination before it goes out and shows exactly what happened after."
            frame={
              <Frame title="Create post" context="Scheduled for Thu, Oct 30, 7:00pm" label="the post composer with four destinations and their status">
                <span className="lp-label">Destinations</span>
                <ul className="lp-dests">
                  <li><PlatformMark platform="instagram" brand /><span>Instagram Reel<small>Also shared to the feed</small></span><span>Scheduled</span></li>
                  <li><PlatformMark platform="youtube" brand /><span>YouTube Short<small>Public at 7:00pm</small></span><span>Scheduled</span></li>
                  <li><PlatformMark platform="facebook" brand /><span>Facebook Page<small>Same caption</small></span><span>Scheduled</span></li>
                  <li><PlatformMark platform="tiktok" brand /><span>TikTok<small>Arrives in your TikTok inbox as a draft</small></span><span>Draft</span></li>
                </ul>
              </Frame>
            }
            side={
              <>
                <span className="lp-side-title">Before it goes out</span>
                <ul className="lp-steps">
                  <li><span>Video length fits all four</span><span>Checked</span></li>
                  <li><span>Caption under every limit</span><span>Checked</span></li>
                  <li><span>Instagram account can publish</span><span>Checked</span></li>
                  <li><span>TikTok posts as a draft only</span><span>Noted</span></li>
                </ul>
                <p className="lp-source">If a platform refuses a post, SOCIA says which one, why, and what to change.</p>
              </>
            }
          />
        </section>

        {/* ------------------------------------------------------------ the rest */}
        <section className="lp-section" aria-labelledby="lp-around">
          <div className="lp-section-head">
            <div>
              <h2 id="lp-around" className="lp-h2">Everything around the post</h2>
              <p className="lp-h2-sub">For one creator, a small team, or an agency running several brands.</p>
            </div>
          </div>

          <div className="lp-grid">
            <div className="lp-tile">
              <ul className="lp-mini" aria-label="Example competitors">
                <li><b>Bakery across town</b><span>5 posts a week</span></li>
                <li><b>Café near campus</b><span>3 posts a week</span></li>
                <li><b>Roastery downtown</b><span>1 post a week</span></li>
              </ul>
              <div>
                <h3 className="lp-tile-name">Competitors</h3>
                <p>What the accounts you follow post, how often, and which of their posts took off.</p>
              </div>
            </div>

            <div className="lp-tile is-wide">
              <div className="lp-week" aria-label="Example week in the calendar">
                <div>Mon<i>Reel</i></div>
                <div>Tue</div>
                <div>Wed<i>Carousel</i></div>
                <div>Thu<i>Reel</i><i>Short</i><i className="is-draft">TikTok draft</i></div>
                <div>Fri</div>
                <div>Sat<i>Image</i></div>
                <div>Sun</div>
              </div>
              <div>
                <h3 className="lp-tile-name">Calendar</h3>
                <p>Every scheduled, published and failed post across your accounts, in one place.</p>
              </div>
            </div>

            <div className="lp-tile">
              <ul className="lp-mini" aria-label="Example approval">
                <li><b>Seasonal menu Reel</b><span>Waiting</span></li>
                <li><span>Submitted by a teammate</span><span>Today</span></li>
              </ul>
              <div>
                <h3 className="lp-tile-name">Approvals</h3>
                <p>Members draft and submit. The owner or an admin approves, and that schedules it.</p>
              </div>
            </div>

            <div className="lp-tile">
              <ul className="lp-mini" aria-label="Example Brand Workspaces">
                <li><b>Your brand</b><span>3 accounts</span></li>
                <li><b>Client one</b><span>2 accounts</span></li>
                <li><b>Client two</b><span>4 accounts</span></li>
              </ul>
              <div>
                <h3 className="lp-tile-name">Brand Workspaces</h3>
                <p>Each brand keeps its own accounts, plans, posts and team, fully separate from the others.</p>
              </div>
            </div>

            <div className="lp-tile">
              <ul className="lp-mini" aria-label="Example alerts">
                <li><b>A Reel is beating your median</b><span>2h ago</span></li>
                <li><b>A post failed on Facebook</b><span>Yesterday</span></li>
              </ul>
              <div>
                <h3 className="lp-tile-name">Alerts and reports</h3>
                <p>A note when something needs you, and a weekly roundup of what happened and why.</p>
              </div>
            </div>

            <div className="lp-tile is-wide" id="assistants">
              <div className="lp-side" aria-label="Example conversation with an AI assistant">
                <span className="lp-side-title">In Claude, with SOCIA connected</span>
                <div className="lp-ask">What were my best Instagram posts this month, and what&apos;s scheduled next week?</div>
                <p className="lp-answer">
                  Your best post was <b>the seasonal menu Reel</b> with 6,210 views, then two carousels with about 2,400
                  each. Next week has <b>4 posts scheduled</b>: Reels on Monday and Thursday, a carousel on Wednesday and
                  an image on Saturday.
                </p>
                <p className="lp-source">Read from SOCIA. Example data.</p>
              </div>
              <div>
                <h3 className="lp-tile-name">SOCIA in Claude and ChatGPT</h3>
                <p>Connect your AI assistant and ask about your analytics, plans and scheduled posts, or have it draft a post for you to review. You choose which brands it can see.</p>
              </div>
            </div>

            <div className="lp-tile">
              <KpiCell label="Reach, last 7 days" value={null} reason="Needs 5 posts in this window; you have 2." />
              <div>
                <h3 className="lp-tile-name">Honest numbers</h3>
                <p>When a platform doesn&apos;t report something, or there isn&apos;t enough data, SOCIA shows a dash and the reason. Never a zero, never a guess.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ plans */}
        <section className="lp-section" aria-labelledby="lp-plans">
          <div className="lp-section-head">
            <h2 id="lp-plans" className="lp-h2">Start free, upgrade when you add brands</h2>
            <Link href="/pricing" className="lp-link">Compare plans</Link>
          </div>
          <div className="lp-plans">
            {PLAN_ORDER.map((id) => (
              <div key={id} className="lp-plan">
                <h3>{PLANS[id].name}</h3>
                <p className="lp-price">${PLANS[id].priceMonthly}<small> a month</small></p>
                <p>{PLANS[id].tagline}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-end">
          <h2 className="lp-h2">Start with the accounts you already have.</h2>
          <p className="lp-h2-sub">Connect Instagram, Facebook, YouTube or TikTok. SOCIA starts from your own numbers.</p>
          <div className="lp-actions-main" style={{ marginTop: "var(--sp-6)" }}>
            <ButtonLink href="/signup" variant="primary" size="lg">Start free</ButtonLink>
            <ButtonLink href="/login" variant="secondary" size="lg">Log in</ButtonLink>
          </div>
        </section>

        <footer className="lp-footer">
          <span>&copy; {year} SOCIA</span>
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

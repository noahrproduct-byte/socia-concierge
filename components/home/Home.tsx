import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { PlatformMark } from "@/components/system/PlatformMark";
import { CONTACT_EMAIL, PLANS, PLAN_ORDER, formatHistory, type PlanId } from "@/lib/plans";
import HomeNav from "./HomeNav";
import HomeFaq from "./HomeFaq";
import HomeMotion from "./HomeMotion";
import HomeWindow from "./HomeWindow";
import HeroStage from "./HeroStage";
import ReelDemo from "./ReelDemo";
import { WEEK } from "./exampleWeek";
import "./home.css";

// The public homepage. Every screen shown is an HTML example of a real SOCIA
// screen, labelled "Example"; every number on them is illustrative and says
// what it is compared with. Nothing here is a testimonial, a logo wall or a
// count SOCIA has not measured. The visual system is documented in home.css.

const FAQ = [
  {
    q: "Which platforms does SOCIA support?",
    a: "Instagram, Facebook Pages and YouTube connect today: analytics, scheduling and publishing. TikTok accounts register now; analytics and posting switch on when TikTok approves SOCIA's API access.",
  },
  {
    q: "What does the free plan include?",
    a: `One Brand Workspace, ${PLANS.free.limits.competitors} competitors, ${formatHistory(PLANS.free.limits.analytics_history_days)} of analytics history, scheduling and publishing, breakout alerts, Content Studio's Build from clips, and read-only access for AI assistants. The pricing page lists every limit.`,
  },
  {
    q: "Does SOCIA post for me?",
    a: "Only what is put on your Calendar. Nothing publishes until you, or an approver on your team, schedule it. On paid plans an AI assistant you connect can create and schedule posts within your plan's limits, and you can withdraw them before they go out.",
  },
  {
    q: "Where do the numbers come from?",
    a: "From each platform's own API, for the accounts you connect. When a platform does not report a metric, SOCIA says so instead of showing a zero.",
  },
  {
    q: "How does SOCIA use my data?",
    a: "To build your analytics, plans and recommendations. It is not sold. Disconnect a platform and SOCIA deletes that platform's history. The privacy policy has the full list of what is stored and for how long.",
  },
  {
    q: "Can I cancel?",
    a: "Yes. Plans are billed monthly with no lock-in. A downgrade takes effect at the end of the period you have paid for.",
  },
];

const PLAN_LINES: Record<PlanId, string[]> = Object.fromEntries(
  PLAN_ORDER.map((id) => {
    const p = PLANS[id];
    const l = p.limits;
    return [
      id,
      [
        `${l.workspaces} Brand ${l.workspaces === 1 ? "Workspace" : "Workspaces"}`,
        `${l.competitors} competitors per brand`,
        `${formatHistory(l.analytics_history_days)} of analytics history`,
        l.team_members > 1 ? `${l.team_members} team members` : "Single user",
      ],
    ];
  }),
) as Record<PlanId, string[]>;

export default function Home({ signedIn }: { signedIn: boolean }) {
  const startHref = signedIn ? "/dashboard" : "/signup";
  const startLabel = signedIn ? "Open your dashboard" : "Get started free";

  return (
    <div className="hm" data-theme="dark">
      <HomeMotion />
      <HomeNav signedIn={signedIn} />

      <main>
        {/* ---- hero: the promise over a slow film of the product (HeroStage) ---- */}
        <section className="hm-hero hm-cine" aria-labelledby="hm-h1">
          <HeroStage />
          <svg className="hm-cine-scrim" aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* a readability wash behind the words, drawn in SVG; see the note on .hm-cine-scrim */}
            <defs>
              <radialGradient id="hm-scrim" cx="50" cy="40" r="52" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 40) scale(1 0.82) translate(-50 -40)">
                <stop offset="0" stopColor="#040506" stopOpacity="0.96" />
                <stop offset="0.7" stopColor="#040506" stopOpacity="0.88" />
                <stop offset="1" stopColor="#040506" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="hm-scrim-edge" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#040506" stopOpacity="0.9" />
                <stop offset="0.16" stopColor="#040506" stopOpacity="0" />
                <stop offset="0.82" stopColor="#040506" stopOpacity="0" />
                <stop offset="1" stopColor="#040506" stopOpacity="1" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill="url(#hm-scrim)" />
            <rect width="100" height="100" fill="url(#hm-scrim-edge)" />
          </svg>
          <div className="hm-wrap hm-hero-copy">
            <span className="hm-cine-eyebrow">Your social media. Finally understood.</span>
            <h1 id="hm-h1" className="hm-h1 hm-cine-h1">
              <span>Know what</span>
              <span className="is-gold">to post next.</span>
            </h1>
            <p className="hm-lead">
              SOCIA connects your social accounts, analyzes your content and audience, identifies opportunities, and helps
              you decide what to create next.
            </p>
            <div className="hm-hero-cta">
              <Link href={startHref} className="hm-btn hm-btn--primary hm-btn--lg">
                {startLabel} <ArrowRight aria-hidden />
              </Link>
              <Link href="#today" className="hm-btn hm-btn--outline hm-btn--lg">
                See SOCIA in action
              </Link>
            </div>
            <p className="hm-meta">
              <span>Free plan</span>
              <span>No card needed</span>
              <span>Instagram, Facebook, YouTube</span>
            </p>
          </div>
        </section>

        {/* ---- four statements ------------------------------------------- */}
        <section className="hm-section" id="loop" aria-labelledby="hm-loop">
          <div className="hm-wrap hm-loop-wrap">
            <div className="hm-section-head is-center" data-reveal="children">
              <span className="hm-eyebrow">The loop</span>
              <h2 id="hm-loop" className="hm-h2 is-center">
                Every post teaches the next plan.
              </h2>
            </div>
            <div className="hm-cycle">
              <svg className="hm-cycle-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <rect x="25" y="25" width="50" height="50" rx="3" fill="none" stroke="#454647" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
              <span className="hm-cycle-arrow is-right" aria-hidden><ArrowRight /></span>
              <span className="hm-cycle-arrow is-down" aria-hidden><ArrowDown /></span>
              <span className="hm-cycle-arrow is-left" aria-hidden><ArrowLeft /></span>
              <span className="hm-cycle-arrow is-up" aria-hidden><ArrowUp /></span>
              <ol className="hm-four" data-reveal="children">
                <li className="hm-four-item">
                  <span className="hm-step-n">01</span>
                  <b>Plan</b>
                  <p>A weekly Content Plan: the diagnosis, the top fixes, and each post&apos;s day, concept, hook and format.</p>
                </li>
                <li className="hm-four-item">
                  <span className="hm-step-n">02</span>
                  <b>Publish</b>
                  <p>Schedule from the plan or from Content Studio. Teams approve first. Nothing goes out without a person.</p>
                </li>
                <li className="hm-four-item">
                  <span className="hm-step-n">03</span>
                  <b>Result</b>
                  <p>Each post is measured against your own median, in the window that matters for its format.</p>
                </li>
                <li className="hm-four-item">
                  <span className="hm-step-n">04</span>
                  <b>Next plan</b>
                  <p>What worked gets more of the week. What did not gets a new concept. Then the cycle starts again at 01.</p>
                </li>
              </ol>
            </div>
            <p className="hm-cycle-return">After 04, the next week starts again at 01.</p>
          </div>
        </section>

        {/* ---- the Dashboard's Today card: the product in action, interactive ---- */}
        <section className="hm-section" id="today" aria-labelledby="hm-today">
          <div className="hm-wrap">
            <div className="hm-section-head is-center" data-reveal="children">
              <span className="hm-eyebrow">See SOCIA in action</span>
              <h2 id="hm-today" className="hm-h2 is-center">
                Open any row to see the reason.
              </h2>
              <p className="hm-lead">
                The Dashboard&apos;s Today card on the example account: the few things worth doing today, each with the
                numbers behind it.
              </p>
            </div>
            <HomeWindow signedIn={signedIn} />
            <p className="hm-caption hm-hero-note">Daily recommendations are on Growth and up.</p>
          </div>
        </section>

        {/* ---- how it works ---------------------------------------------- */}
        <section className="hm-section" id="how" aria-labelledby="hm-how">
          <div className="hm-wrap">
            <div className="hm-section-head is-center" data-reveal="children">
              <span className="hm-eyebrow">How it works</span>
              <h2 id="hm-how" className="hm-h2 is-center">
                How SOCIA turns your results into the next post.
              </h2>
            </div>
            <ol className="hm-steps" data-reveal="children">
              <li className="hm-step">
                <span className="hm-step-n">01</span>
                <h3>Connect your accounts</h3>
                <p>
                  Instagram, Facebook and YouTube connect in a minute. SOCIA reads your posts, your audience and how each
                  post did, and keeps a daily record from then on.
                </p>
              </li>
              <li className="hm-step">
                <span className="hm-step-n">02</span>
                <h3>Get your plan</h3>
                <p>
                  Every week, a Content Plan: the diagnosis, the top fixes, and each post&apos;s day, concept, hook and
                  format, built from your own results and the competitors you follow.
                </p>
                <small>Weekly Content Plan is on Starter and up.</small>
              </li>
              <li className="hm-step">
                <span className="hm-step-n">03</span>
                <h3>Create, publish, learn</h3>
                <p>
                  Build Reels from your clips, draft captions, schedule, collect approvals and publish. Each post&apos;s result
                  feeds the next plan.
                </p>
              </li>
            </ol>
          </div>
        </section>

        {/* ---- what's inside: the four jobs, in order, on the same example week ---- */}
        <section className="hm-section" id="screens" aria-labelledby="hm-screens">
          <div className="hm-wrap">
            <div className="hm-section-head is-center" data-reveal="children">
              <span className="hm-eyebrow">What&apos;s inside</span>
              <h2 id="hm-screens" className="hm-h2 is-center">
                Understand, decide, make, publish.
              </h2>
              <p className="hm-lead">The screens behind each step, on the same example account and the same week.</p>
            </div>
            <div className="hm-rows">
              {/* understand: analytics */}
              <div className="hm-row" data-reveal="children">
                <div className="hm-row-copy">
                  <span className="hm-job-tag">Understand</span>
                  <h3 className="hm-h3">See what beat your median.</h3>
                  <p>
                    Every post is compared with your own typical post on the same platform, not with a stranger&apos;s
                    benchmark. What changed, what is working, what is missing and what to do next, with the numbers
                    behind each line.
                  </p>
                </div>
                <div className="hm-shot" role="img" aria-label="Example of the Analytics page: four Instagram posts compared with the account's median views">
                  <div className="hm-shot-head">
                    <b>Top posts, last 30 days</b>
                    <span>
                      Instagram, views <span className="hm-example">Example</span>
                    </span>
                  </div>
                  <ul className="hm-bars">
                    <li>
                      <span>
                        <em>How to make a better latte at home</em>
                        <span className="hm-bar"><i style={{ width: "100%" }} /></span>
                      </span>
                      <output>2.4×</output>
                    </li>
                    <li>
                      <span>
                        <em>Our new seasonal oat latte</em>
                        <span className="hm-bar"><i style={{ width: "71%" }} /></span>
                      </span>
                      <output>1.7×</output>
                    </li>
                    <li>
                      <span>
                        <em>Your median post</em>
                        <span className="hm-bar is-median"><i style={{ width: "42%" }} /></span>
                      </span>
                      <output>1.0×</output>
                    </li>
                    <li>
                      <span>
                        <em>A quiet morning at the cafe</em>
                        <span className="hm-bar"><i style={{ width: "20%" }} /></span>
                      </span>
                      <output>0.5×</output>
                    </li>
                  </ul>
                  <span className="hm-caption">Views two days after posting, against your last 20 posts at the same age. Views as Instagram reports them.</span>
                </div>
              </div>

              {/* decide: the Content Plan, the screen the promise rests on, so it gets the most room */}
              <div className="hm-row is-wide" data-reveal="children">
                <div className="hm-row-copy">
                  <span className="hm-job-tag">Decide</span>
                  <h3 className="hm-h3">A week planned from evidence.</h3>
                  <p>
                    The Content Plan says what to post each day and why: the format that is working for you, the gap your
                    competitors are filling, the time your audience shows up. Accept it, edit it, or schedule it as it is.
                  </p>
                </div>
                <div className="hm-app hm-plan-app" role="img" aria-label="Example of a weekly Content Plan with five planned posts, the reason for each, and their status">
                  <div className="hm-app-bar">
                    <span className="hm-app-dots" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="hm-app-url">Content Plan: this week, Northside Roasters</span>
                    <span className="hm-example">Example data</span>
                  </div>
                  <ul className="hm-plan-week">
                    {WEEK.map((w) => (
                      <li key={w.day}>
                        <span className="hm-plan-day">{w.day}</span>
                        <span className="hm-plan-what">
                          <b>{w.title}</b>
                          <em>{w.why}</em>
                        </span>
                        <span className="hm-plan-when">{w.when}</span>
                        <span className={`hm-status${w.done ? " is-on" : ""}`}>{w.status}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="hm-window-foot">
                    <span>Every reason uses your own posts from the last 90 days. Nothing publishes until it is scheduled.</span>
                  </div>
                </div>
              </div>

              {/* make: Content Studio */}
              <div className="hm-row is-flip" id="studio" data-reveal="children">
                <div className="hm-row-copy">
                  <span className="hm-job-tag">Make</span>
                  <h3 className="hm-h3">Footage in, a first cut out.</h3>
                  <p>
                    Upload the clips you already have. Content Studio finds the usable moments, cuts a draft with captions
                    you can edit, and puts it in the plan&apos;s open slot. Here, Friday&apos;s follow-up to Sunday&apos;s
                    latte Reel.
                  </p>
                </div>
                <div className="hm-app hm-studio">
                  <div className="hm-app-bar">
                    <span className="hm-app-dots" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="hm-app-url">Content Studio: one clip, a latte being poured</span>
                    <span className="hm-example">Example data</span>
                  </div>
                  <div className="hm-studio-body">
                    <div className="hm-studio-preview">
                      <ReelDemo src="/landing/reel.mp4" poster="/landing/reel.jpg" />
                    </div>
                    <div className="hm-studio-panel">
                      <div className="hm-studio-block">
                        <span className="hm-job-tag">Moments found</span>
                        <ul className="hm-studio-strip" aria-label="Moments found in the example clip">
                          {["04", "16", "28", "40", "52", "64"].map((f, i) => (
                            <li key={f}>
                              <Image src={`/landing/frames/f${f}.jpg`} alt="" width={72} height={128} sizes="72px" />
                              <span>0:0{Math.floor(Number(f) / 10)}</span>
                              {i === 0 || i === 3 || i === 5 ? <b>Used</b> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="hm-studio-block">
                        <span className="hm-job-tag">First cut, 8 seconds</span>
                        <ol className="hm-studio-cut">
                          <li>
                            <span>0:00</span>
                            <em>The pour, close up. &ldquo;A better latte at home&rdquo;</em>
                          </li>
                          <li>
                            <span>0:03</span>
                            <em>Milk meets espresso. &ldquo;Pour from higher first&rdquo;</em>
                          </li>
                          <li>
                            <span>0:06</span>
                            <em>The finished cup. &ldquo;Then drop low to draw&rdquo;</em>
                          </li>
                        </ol>
                      </div>
                      <p className="hm-studio-next">Goes to Friday, 6:30 PM, as a draft. Every cut and caption stays editable.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* publish: approvals */}
              <div className="hm-row" data-reveal="children">
                <div className="hm-row-copy">
                  <span className="hm-job-tag">Publish</span>
                  <h3 className="hm-h3">Approvals, for teams and clients.</h3>
                  <p>
                    Members submit, owners and admins approve, and approving is scheduling. Everyone sees the same
                    Calendar and gets their own notifications. Nothing publishes by accident.
                  </p>
                </div>
                <div className="hm-shot" role="img" aria-label="Example of the approvals list with two posts waiting for an owner or admin to approve them">
                  <div className="hm-shot-head">
                    <b>Waiting for approval</b>
                    <span>
                      2 posts <span className="hm-example">Example</span>
                    </span>
                  </div>
                  <div className="hm-approve">
                    {WEEK.filter((w) => w.status === "Needs approval").map((w) => (
                      <div key={w.day} className="hm-approve-item">
                        <span>
                          <b>{w.title}</b>
                          <em>
                            Submitted by Maya, for {w.day} {w.when}, {w.where}
                          </em>
                        </span>
                        <span className="hm-status">Needs approval</span>
                      </div>
                    ))}
                  </div>
                  <span className="hm-caption">An owner or admin approves each one, and approving schedules it.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- platforms --------------------------------------------------- */}
        <section className="hm-section" id="platforms" aria-labelledby="hm-platforms">
          <div className="hm-wrap">
            <div className="hm-section-head is-center" data-reveal="children">
              <span className="hm-eyebrow">Supported platforms</span>
              <h2 id="hm-platforms" className="hm-h2 is-center">
                Publish where your audience already is.
              </h2>
            </div>
            <ul className="hm-platforms" data-reveal="children">
              <li className="hm-platform">
                <div className="hm-platform-head">
                  <PlatformMark platform="instagram" brand />
                  Instagram
                </div>
                <p>Posts and Reels, Trial Reels, collaborators, comment replies, posting-time analysis and analytics.</p>
              </li>
              <li className="hm-platform">
                <div className="hm-platform-head">
                  <PlatformMark platform="facebook" brand />
                  Facebook
                </div>
                <p>Page posts and Reels, scheduling and analytics for the Pages you manage.</p>
              </li>
              <li className="hm-platform">
                <div className="hm-platform-head">
                  <PlatformMark platform="youtube" brand />
                  YouTube
                </div>
                <p>Channel analytics, video and Shorts uploads, scheduling from the Calendar.</p>
              </li>
              <li className="hm-platform is-pending">
                <div className="hm-platform-head">
                  <PlatformMark platform="tiktok" brand />
                  TikTok
                </div>
                <p>Accounts register now. Analytics and posting switch on when TikTok approves SOCIA&apos;s API access.</p>
                <span className="hm-status">Waiting on TikTok</span>
              </li>
            </ul>
          </div>
        </section>

        {/* ---- AI assistants ------------------------------------------------ */}
        <section className="hm-section" id="assistants" aria-labelledby="hm-assistants">
          <div className="hm-wrap">
            <div className="hm-section-head" data-reveal="children">
              <span className="hm-eyebrow">AI assistants</span>
              <h2 id="hm-assistants" className="hm-h2">
                Ask Claude or ChatGPT about your own numbers.
              </h2>
              <p className="hm-lead">
                SOCIA is an MCP server. Connect the assistant you already use from Settings, and it can read your SOCIA
                data on every plan, and draft and schedule posts on paid plans. It never sees your logins or tokens.
              </p>
            </div>
            <ul className="hm-agents" data-reveal="children">
              <li className="hm-agent">
                <small>Assistant</small>
                <b>Claude</b>
                <p>Add SOCIA as a connector in Claude and ask about your week, your top posts or your plan.</p>
              </li>
              <li className="hm-agent">
                <small>Assistant</small>
                <b>ChatGPT</b>
                <p>Connect SOCIA where ChatGPT lists custom connectors, with the same tools and the same limits.</p>
              </li>
              <li className="hm-agent">
                <small>Any MCP client</small>
                <b>Claude Code, Cursor and more</b>
                <p>Any client that speaks MCP connects through SOCIA&apos;s own sign-in. Access is per workspace and revocable.</p>
              </li>
            </ul>
            <div className="hm-agent-tools">
              <span className="hm-small">What an assistant can read, on every plan:</span>
              <ul aria-label="Read-only tools">
                {["Connected accounts", "Account analytics", "Top posts vs. your median", "Insights", "Today's recommendations", "Best posting times", "Content Plan", "Calendar", "Media library"].map((t) => (
                  <li key={t} className="hm-tag">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---- pricing ------------------------------------------------------ */}
        <section className="hm-section" id="pricing" aria-labelledby="hm-pricing">
          <div className="hm-wrap">
            <div className="hm-section-head is-center" data-reveal="children">
              <span className="hm-eyebrow">Pricing</span>
              <h2 id="hm-pricing" className="hm-h2 is-center">
                Monthly plans, no lock-in.
              </h2>
            </div>
            <div className="hm-plans" data-reveal="children">
              {PLAN_ORDER.map((id) => {
                const p = PLANS[id];
                const free = p.priceMonthly === 0;
                return (
                  <div key={id} className="hm-plan">
                    <h3>{p.name}</h3>
                    <div className="hm-price">
                      <b>${p.priceMonthly}</b>
                      <span>per month</span>
                    </div>
                    <p>{p.tagline}</p>
                    <ul>
                      {PLAN_LINES[id].map((line) => (
                        <li key={line}>
                          <Check aria-hidden />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                    {free ? (
                      <Link href={startHref} className="hm-btn hm-btn--primary">
                        {startLabel}
                      </Link>
                    ) : (
                      <Link href={`/pricing#plan-${id}`} className="hm-btn hm-btn--outline">
                        See {p.name} in detail
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="hm-plans-note hm-small">
              Every plan includes everything in the plans below it. <Link href="/pricing" className="hm-link-ink">Compare all limits and features.</Link>
            </p>
          </div>
        </section>

        {/* ---- FAQ ---------------------------------------------------------- */}
        <section className="hm-section" id="faq" aria-labelledby="hm-faq">
          <div className="hm-wrap">
            <div className="hm-section-head is-center" data-reveal="children">
              <span className="hm-eyebrow">Questions</span>
              <h2 id="hm-faq" className="hm-h2 is-center">
                Before you connect an account.
              </h2>
            </div>
            <HomeFaq items={FAQ} />
          </div>
        </section>

        {/* ---- end ---------------------------------------------------------- */}
        <section className="hm-end" id="start" aria-labelledby="hm-end">
          <div className="hm-wrap" data-reveal="children">
            <span className="hm-end-mark" aria-hidden>
              <Image src="/brand/socia-mark-tile.png" alt="" width={72} height={72} />
            </span>
            <h2 id="hm-end" className="hm-h2 is-center">
              Connect your accounts. Get your next post.
            </h2>
            <p className="hm-lead hm-end-lead">
              Link Instagram, Facebook or YouTube. SOCIA reads your own posts and tells you what to post next, why it should
              work, and when.
            </p>
            <div className="hm-end-cta">
              <Link href={startHref} className="hm-btn hm-btn--primary hm-btn--lg">
                {startLabel}
              </Link>
            </div>
            <p className="hm-end-facts">The free plan needs no card. Paid plans cancel any month.</p>
          </div>
        </section>
      </main>

      <footer className="hm-footer">
        <div className="hm-wrap">
          <div className="hm-footer-grid">
            <div className="hm-footer-brand">
              <Link href="/" className="hm-brand">
                <BrandMark size={22} /> SOCIA
              </Link>
              <p className="hm-small">
                SOCIA studies your content, audience and competitors, then tells you what to post, why it should work and
                when to publish.
              </p>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li><Link href="/pricing">Pricing</Link></li>
                <li><a href="#how">How it works</a></li>
                <li><a href="#platforms">Platforms</a></li>
                <li><a href="#assistants">AI assistants</a></li>
              </ul>
            </div>
            <div>
              <h4>Company</h4>
              <ul>
                <li><a href={`mailto:${CONTACT_EMAIL}`}>Contact</a></li>
                <li><Link href="/privacy">Privacy</Link></li>
                <li><Link href="/terms">Terms</Link></li>
                <li><Link href="/login">Log in</Link></li>
              </ul>
            </div>
          </div>
          <div className="hm-footer-foot">
            <p className="hm-meta">
              <span>&copy; 2026 SOCIA</span>
              <span>sociaos.com</span>
              <span>Instagram, Facebook, YouTube and TikTok are trademarks of their owners</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, Check, Clapperboard, ClipboardList, Send } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { PlatformMark } from "@/components/system/PlatformMark";
import { CONTACT_EMAIL, PLANS, PLAN_ORDER, formatHistory, type PlanId } from "@/lib/plans";
import HomeNav from "./HomeNav";
import HomeFaq from "./HomeFaq";
import HomeMotion from "./HomeMotion";
import HomeWindow from "./HomeWindow";
import ReelDemo from "./ReelDemo";
import type { HomeAssets } from "@/lib/homeAssets";
import "./home.css";

// The public homepage. Every screen shown is an HTML example of a real SOCIA
// screen, labelled "Example"; every number on them is illustrative and says
// what it is compared with. Nothing here is a testimonial, a logo wall or a
// count SOCIA has not measured. The visual system is documented in home.css.

const JOBS: {
  icon: React.ComponentType<{ "aria-hidden"?: boolean }>;
  job: string;
  core: { name: string; what: string };
  parts: string[];
}[] = [
  {
    icon: BarChart3,
    job: "Understand",
    core: { name: "Analytics", what: "Every post against your own median, with the timing behind it." },
    parts: ["Posting times", "Competitors", "Alerts", "Weekly roundup"],
  },
  {
    icon: ClipboardList,
    job: "Decide",
    core: { name: "Content Plan", what: "A week of posts, each with its day, hook, format and reason." },
    parts: ["Today", "Worth posting again", "AI assistants"],
  },
  {
    icon: Clapperboard,
    job: "Make",
    core: { name: "Content Studio", what: "First cuts of Reels from the clips you already have." },
    parts: ["Captions", "Trial Reels", "Collaborators"],
  },
  {
    icon: Send,
    job: "Publish",
    core: { name: "Calendar", what: "Schedule once for Instagram, Facebook and YouTube." },
    parts: ["Approvals", "Comments inbox", "Reports"],
  },
];

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

export default function Home({ signedIn, assets }: { signedIn: boolean; assets: HomeAssets }) {
  const startHref = signedIn ? "/dashboard" : "/signup";
  const startLabel = signedIn ? "Open your dashboard" : "Get started free";

  return (
    <div className="hm" data-theme="dark">
      <HomeMotion />
      <HomeNav signedIn={signedIn} />

      <main>
        {/* ---- hero ---------------------------------------------------- */}
        <section className="hm-hero" aria-labelledby="hm-h1">
          <div className="hm-wrap hm-hero-copy">
            <h1 id="hm-h1" className="hm-h1">
              Know what to post next.
            </h1>
            <p className="hm-lead">SOCIA reads your accounts and tells you what to post, why, and when.</p>
            <div className="hm-hero-cta">
              <Link href={startHref} className="hm-btn hm-btn--primary hm-btn--lg">
                {startLabel}
              </Link>
            </div>
            <p className="hm-meta">
              <span>Free plan</span>
              <span>No card needed</span>
              <span>Instagram, Facebook, YouTube</span>
            </p>
          </div>
        </section>

        {/* ---- the question --------------------------------------------- */}
        <section className="hm-section hm-ask" id="question" aria-labelledby="hm-ask">
          <div className="hm-wrap" data-reveal="children">
            <h2 id="hm-ask" className="hm-ask-line">
              Every week starts with the same question. <span>What do I post, and why would it work?</span>
            </h2>
            <p className="hm-lead">
              Most people answer it by feel. SOCIA answers it from your own numbers, and gives you the reason with the post.
            </p>
          </div>
        </section>

        {/* ---- the app window: the Dashboard's Today card ----------------- */}
        <section className="hm-section hm-window-sec" id="today" aria-labelledby="hm-window">
          <div className="hm-wrap">
            <div className="hm-section-head is-center" data-reveal="children">
              <span className="hm-eyebrow">The answer, every morning</span>
              <h2 id="hm-window" className="hm-h2 is-center">
                One place for what needs you today.
              </h2>
              <p className="hm-lead">Open any row to see the numbers behind it.</p>
            </div>
            <HomeWindow signedIn={signedIn} />
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
            <p className="hm-caption hm-four-note">Daily recommendations and the Today card are on Growth and up.</p>
          </div>
        </section>

        {/* ---- what's inside: four jobs ------------------------------------- */}
        <section className="hm-section" id="product" aria-labelledby="hm-jobs">
          <div className="hm-wrap">
            <div className="hm-section-head is-center" data-reveal="children">
              <span className="hm-eyebrow">What&apos;s inside</span>
              <h2 id="hm-jobs" className="hm-h2 is-center">
                Four jobs, one place.
              </h2>
            </div>
            <ul className="hm-jobs" data-reveal="children">
              {JOBS.map((j) => {
                const Icon = j.icon;
                return (
                  <li key={j.job} className="hm-job">
                    <span className="hm-job-head">
                      <Icon aria-hidden />
                      {j.job}
                    </span>
                    <b className="hm-job-core">{j.core.name}</b>
                    <p>{j.core.what}</p>
                    <span className="hm-job-also">Also: {j.parts.join(", ")}</span>
                  </li>
                );
              })}
            </ul>
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

        {/* ---- see for yourself: Content Studio ----------------------------- */}
        <section className="hm-section" id="studio" aria-labelledby="hm-studio">
          <div className="hm-wrap hm-demo">
            <div className="hm-media" data-reveal>
              <ReelDemo src="/landing/reel.mp4" poster="/landing/reel.jpg" />
              <span className="hm-caption">Example footage. Content Studio works on your own clips.</span>
            </div>
            <div>
              <div className="hm-section-head" data-reveal="children">
                <span className="hm-eyebrow">Content Studio</span>
                <h2 id="hm-studio" className="hm-h2">
                  Making a Reel is this short.
                </h2>
                <p className="hm-lead">Content Studio takes the footage you already have and gets it to the Calendar.</p>
              </div>
              <ol className="hm-demo-steps">
                <li>
                  <i>1</i>
                  <div>
                    <b>Upload clips</b>
                    <p>Phone footage, as it is. SOCIA finds the usable moments in each clip.</p>
                  </div>
                </li>
                <li>
                  <i>2</i>
                  <div>
                    <b>Make this video</b>
                    <p>SOCIA cuts the first draft: hook, order, pacing, captions and sound. Every cut is editable.</p>
                  </div>
                </li>
                <li>
                  <i>3</i>
                  <div>
                    <b>Plan these posts</b>
                    <p>The finished Reels land in your Calendar as drafts, at times taken from your own history when there is enough of it.</p>
                  </div>
                </li>
                <li>
                  <i>4</i>
                  <div>
                    <b>Publish</b>
                    <p>Review, approve, post. Then SOCIA tracks how it does against your median.</p>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </section>

        {/* ---- product rows ------------------------------------------------- */}
        <section className="hm-section" id="screens" aria-labelledby="hm-screens">
          <div className="hm-wrap">
            <div className="hm-section-head" data-reveal="children">
              <span className="hm-eyebrow">The screens</span>
              <h2 id="hm-screens" className="hm-h2">
                The screens you will use every week.
              </h2>
            </div>
            <div className="hm-rows">
              {/* analytics */}
              <div className="hm-row" data-reveal="children">
                <div className="hm-row-copy">
                  <h3 className="hm-h3">See what beat your median.</h3>
                  <p>
                    Every post is compared with your own typical post on the same platform, not with a stranger&apos;s
                    benchmark. What changed, what is working, what is missing and what to do next, with the numbers
                    behind each line.
                  </p>
                  <Link href={startHref} className="hm-btn hm-btn--outline">
                    {startLabel} <ArrowRight aria-hidden />
                  </Link>
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
                        <em>Three mistakes quietly killing your reach</em>
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
                  <span className="hm-caption">Median of your last 20 posts. Views as Instagram reports them.</span>
                </div>
              </div>

              {/* content plan */}
              <div className="hm-row is-flip" data-reveal="children">
                <div className="hm-row-copy">
                  <h3 className="hm-h3">A week planned from evidence.</h3>
                  <p>
                    The Content Plan says what to post each day and why: the format that is working for you, the gap your
                    competitors are filling, the time your audience shows up. Accept it, edit it, or schedule it as it is.
                  </p>
                  <Link href={startHref} className="hm-btn hm-btn--outline">
                    {startLabel} <ArrowRight aria-hidden />
                  </Link>
                </div>
                <div className="hm-shot" role="img" aria-label="Example of a weekly Content Plan with four planned posts and their status">
                  <div className="hm-shot-head">
                    <b>This week&apos;s plan</b>
                    <span>
                      4 posts <span className="hm-example">Example</span>
                    </span>
                  </div>
                  <ul className="hm-week">
                    <li>
                      <span>Mon</span>
                      <span>
                        <b>Behind the counter: the 6 AM open</b>
                        <em>Reel, educational. Your Reels did 1.8× your median post over 90 days.</em>
                      </span>
                      <span className="hm-status is-on">Published</span>
                    </li>
                    <li>
                      <span>Wed</span>
                      <span>
                        <b>The roast we almost didn&apos;t sell</b>
                        <em>Carousel, story. Fills the gap two competitors post weekly.</em>
                      </span>
                      <span className="hm-status is-on">Scheduled</span>
                    </li>
                    <li>
                      <span>Fri</span>
                      <span>
                        <b>Three ways to order that aren&apos;t on the menu</b>
                        <em>Reel, educational. 6:30 PM, your best Friday window.</em>
                      </span>
                      <span className="hm-status">Draft</span>
                    </li>
                    <li>
                      <span>Sun</span>
                      <span>
                        <b>Ask the regulars</b>
                        <em>Post, community. Replies have been your strongest signal.</em>
                      </span>
                      <span className="hm-status">Draft</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* approvals */}
              <div className="hm-row" data-reveal="children">
                <div className="hm-row-copy">
                  <h3 className="hm-h3">Approvals, for teams and clients.</h3>
                  <p>
                    Members submit, owners and admins approve, and approving is scheduling. Everyone sees the same
                    Calendar and gets their own notifications. Nothing publishes by accident.
                  </p>
                  <Link href="/pricing" className="hm-btn hm-btn--outline">
                    See plans with teams <ArrowRight aria-hidden />
                  </Link>
                </div>
                <div className="hm-shot" role="img" aria-label="Example of the approvals list with two posts waiting for approval">
                  <div className="hm-shot-head">
                    <b>Waiting for approval</b>
                    <span>
                      2 posts <span className="hm-example">Example</span>
                    </span>
                  </div>
                  <div className="hm-approve">
                    <div className="hm-approve-item">
                      <span>
                        <b>The roast we almost didn&apos;t sell</b>
                        <em>Submitted by Maya, for Wed 12:00 PM, Instagram and Facebook</em>
                      </span>
                      <span className="hm-approve-actions">
                        <span className="hm-btn hm-btn--outline hm-btn--sm">Edit</span>
                        <span className="hm-btn hm-btn--primary hm-btn--sm">Approve</span>
                      </span>
                    </div>
                    <div className="hm-approve-item">
                      <span>
                        <b>Ask the regulars</b>
                        <em>Submitted by Maya, for Sun 10:00 AM, Instagram</em>
                      </span>
                      <span className="hm-approve-actions">
                        <span className="hm-btn hm-btn--outline hm-btn--sm">Edit</span>
                        <span className="hm-btn hm-btn--primary hm-btn--sm">Approve</span>
                      </span>
                    </div>
                  </div>
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
            {assets.heroMark && (
              <span className="hm-end-mark" aria-hidden>
                <Image src={assets.heroMark} alt="" width={1600} height={912} sizes="360px" loading="eager" unoptimized />
              </span>
            )}
            <h2 id="hm-end" className="hm-h2 is-center">
              Know what to post, why, and when.
            </h2>
            <div className="hm-end-cta">
              <Link href={startHref} className="hm-btn hm-btn--primary hm-btn--lg">
                {startLabel}
              </Link>
            </div>
            <p className="hm-end-facts">Free plan. No card needed. Cancel any month.</p>
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

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Mail } from "lucide-react";
import { PlatformMark } from "@/components/system/PlatformMark";
import { PLANS, SALE_ORDER, formatHistory, type PlanId } from "@/lib/plans";
import { CONTACT_EMAIL, awaitingAccessText, offlineReason, openPlatformsText, platformRequestHref, type OfflinePlatform } from "@/lib/platformStatus";
import HomeNav from "./HomeNav";
import HomeFooter from "./HomeFooter";
import HomeFaq from "./HomeFaq";
import HomeMotion from "./HomeMotion";
import HomeWindow from "./HomeWindow";
import HeroStage from "./HeroStage";
import FeatureExplorer from "./FeatureExplorer";
import IntroGate from "@/components/intro/IntroGate";
import { AskDemo, Engine, Orbit, Problem, Results, Steps } from "./HomeStory";
import Transform from "./Transform";
import Evidence from "./Evidence";
import "./home.css";

// The public homepage. Every screen shown is an HTML example of a real SOCIA
// screen, labelled "Example"; every number on them is illustrative and says
// what it is compared with. Nothing here is a testimonial, a logo wall or a
// count SOCIA has not measured. The visual system is documented in home.css.

const FAQ = [
  {
    q: "Which platforms does SOCIA support?",
    a: `${openPlatformsText()} connect today: analytics, scheduling and publishing. ${awaitingAccessText("facebook")} ${awaitingAccessText("tiktok")} To connect either one, email ${CONTACT_EMAIL}.`,
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
  SALE_ORDER.map((id) => {
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

/** A platform waiting on access: says so plainly, and offers an email to ask for it. */
function PendingPlatform({ platform }: { platform: OfflinePlatform }) {
  const name = platform === "facebook" ? "Facebook" : "TikTok";
  return (
    <>
      <p>
        {awaitingAccessText(platform)} Want to connect your {name} account?
      </p>
      <a className="hm-btn hm-btn--outline hm-btn--sm hm-platform-cta" href={platformRequestHref(platform)}>
        <Mail aria-hidden /> Contact us
      </a>
    </>
  );
}

export default function Home({ signedIn, intro = false }: { signedIn: boolean; intro?: boolean }) {
  const startHref = signedIn ? "/dashboard" : "/signup";
  const startLabel = signedIn ? "Open your dashboard" : "Get started free";

  return (
    <div className="hm">
      <HomeMotion />
      <HomeNav signedIn={signedIn} />

      <main>
        {/* ---- hero: the promise over a slow film of the product (HeroStage) ---- */}
        <section className="hm-hero hm-cine" aria-labelledby="hm-h1">
          <HeroStage />
          <svg className="hm-cine-scrim" aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* a local readability wash behind the words and buttons, drawn in SVG; see the note on .hm-cine-scrim */}
            <defs>
              <radialGradient id="hm-scrim" cx="50" cy="34" r="40" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 34) scale(0.9 1) translate(-50 -34)">
                <stop offset="0" stopColor="#f7f6f3" stopOpacity="0.92" />
                <stop offset="0.62" stopColor="#f7f6f3" stopOpacity="0.7" />
                <stop offset="1" stopColor="#f7f6f3" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="hm-scrim-cta" cx="50" cy="60" r="26" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 60) scale(1 0.26) translate(-50 -60)">
                <stop offset="0" stopColor="#f7f6f3" stopOpacity="0.85" />
                <stop offset="0.6" stopColor="#f7f6f3" stopOpacity="0.6" />
                <stop offset="1" stopColor="#f7f6f3" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="hm-scrim-side" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#f7f6f3" stopOpacity="0.85" />
                <stop offset="0.14" stopColor="#f7f6f3" stopOpacity="0" />
                <stop offset="0.86" stopColor="#f7f6f3" stopOpacity="0" />
                <stop offset="1" stopColor="#f7f6f3" stopOpacity="0.85" />
              </linearGradient>
              <linearGradient id="hm-scrim-edge" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#f7f6f3" stopOpacity="0.9" />
                <stop offset="0.14" stopColor="#f7f6f3" stopOpacity="0" />
                <stop offset="0.95" stopColor="#f7f6f3" stopOpacity="0" />
                <stop offset="1" stopColor="#f7f6f3" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill="url(#hm-scrim)" />
            <rect width="100" height="100" fill="url(#hm-scrim-cta)" />
            <rect width="100" height="100" fill="url(#hm-scrim-side)" />
            <rect width="100" height="100" fill="url(#hm-scrim-edge)" />
          </svg>
          <div className="hm-wrap hm-hero-copy">
            <span className="hm-cine-eyebrow">Your social media. Finally understood.</span>
            <h1 id="hm-h1" className="hm-h1 hm-cine-h1">
              <span>Know what</span>{" "}
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
              <span>{openPlatformsText()}</span>
            </p>
          </div>
        </section>

        {/* ---- everything you need: the ten parts of SOCIA, one example window each ---- */}
        <FeatureExplorer signedIn={signedIn} />

        {/* ---- the problem: four signals, from the live site ---- */}
        <Problem />

        {/* ---- how SOCIA decides: one recommendation and what it stands on ---- */}
        <Evidence />

        {/* ---- four statements ------------------------------------------- */}
        <section className="hm-section" id="loop" aria-labelledby="hm-loop">
          <div className="hm-wrap hm-loop-wrap">
            <div className="hm-section-head is-center" data-reveal="children">
              <span className="hm-eyebrow">The loop</span>
              <h2 id="hm-loop" className="hm-h2 is-center">
                Every post teaches the next plan.
              </h2>
            </div>
            <Orbit />
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
        <Steps />

        {/* ---- the SOCIA engine, from the live site ---- */}
        <Engine />

        {/* ---- Ask SOCIA, from the live site ---- */}
        <AskDemo startHref={startHref} startLabel={startLabel} />

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
              <li className={`hm-platform${offlineReason("facebook") ? " is-pending" : ""}`}>
                <div className="hm-platform-head">
                  <PlatformMark platform="facebook" brand />
                  Facebook
                </div>
                {offlineReason("facebook") ? (
                  <PendingPlatform platform="facebook" />
                ) : (
                  <p>Page posts and Reels, scheduling and analytics for the Pages you manage.</p>
                )}
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
                <PendingPlatform platform="tiktok" />
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

        {/* ---- before and after: six tools become one workspace ---- */}
        <Transform />

        {/* ---- results: what each plan actually did ---- */}
        <Results />

        {/* ---- pricing ------------------------------------------------------ */}
        <section className="hm-section" id="pricing" aria-labelledby="hm-pricing">
          <div className="hm-wrap">
            <div className="hm-section-head is-center" data-reveal="children">
              <span className="hm-eyebrow">Pricing</span>
              <h2 id="hm-pricing" className="hm-h2 is-center">
                Monthly plans. <em>No lock-in.</em>
              </h2>
            </div>
            <div className="hm-plans" data-reveal="children" style={{ "--plans": SALE_ORDER.length } as React.CSSProperties}>
              {SALE_ORDER.map((id) => {
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
              Connect your accounts. <em>Get your next post.</em>
            </h2>
            <p className="hm-lead hm-end-lead">
              Link {openPlatformsText("or")}. SOCIA reads your own posts and tells you what to post next, why it should
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

      <HomeFooter />
      {/* the intro film, once, for a first-time visitor (lib/intro.ts) */}
      {intro && <IntroGate />}
    </div>
  );
}

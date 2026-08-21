"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  Users,
  Heart,
  ShoppingBag,
  Star,
  Briefcase,
  DollarSign,
  Rocket,
  Wand2,
  ScanSearch,
} from "lucide-react";
import { NICHES } from "@/lib/niches";
import ConnectAccounts from "./ConnectAccounts";
import BrandMark from "./BrandMark";

type Phase = "connect" | "analyzing" | "confirm" | "building" | "pricing";

type Extracted = {
  niche: string;
  brand_name: string;
  goal: string;
  summary: string;
  highlights: string[];
  best_format: string;
} | null;

type Account = {
  username: string | null;
  name: string | null;
  followers: number | null;
  media_count: number | null;
  account_type: string | null;
} | null;

const GOALS = [
  { id: "Grow my followers", label: "Grow followers", icon: <Users size={20} /> },
  { id: "More engagement", label: "More engagement", icon: <Heart size={20} /> },
  { id: "Drive sales & bookings", label: "Drive sales", icon: <ShoppingBag size={20} /> },
  { id: "Build my personal brand", label: "Personal brand", icon: <Star size={20} /> },
  { id: "Get leads & clients", label: "Leads & clients", icon: <Briefcase size={20} /> },
  { id: "Monetize my audience", label: "Monetize", icon: <DollarSign size={20} /> },
];

const STEPS = ["Connect", "Your account", "Your plan", "Choose plan"];

const ANALYZE_STEPS = [
  "Connecting to your account",
  "Reading your recent posts",
  "Measuring what performs",
  "Detecting your niche",
  "Drafting your strategy",
];

function buildingSteps(niche: string) {
  const n = niche || "your niche";
  return [
    `Analyzing the ${n} space`,
    "Studying what top creators are posting",
    "Finding your best times to post",
    "Scoring hook ideas for your audience",
    "Writing your first week of content",
  ];
}

function planFor(niche: string) {
  const n = (niche || "your niche").toLowerCase();
  return [
    { day: "Mon", format: "Reel", hook: `3 ${n} mistakes quietly killing your reach`, tag: "High hook score", score: 92 },
    { day: "Wed", format: "Carousel", hook: `The ${n} starter kit nobody talks about`, tag: "Save-worthy", score: 88 },
    { day: "Fri", format: "Reel", hook: `I tried this for 30 days. Here's what changed`, tag: "Story-driven", score: 90 },
    { day: "Sun", format: "Story", hook: `Behind the scenes of my ${n} process`, tag: "Builds trust", score: 85 },
  ];
}

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 0,
    blurb: "Try the essentials",
    features: ["1 connected account", "Weekly content ideas", "Basic scoring"],
    cta: "Continue free",
    popular: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    blurb: "For creators who post to grow",
    features: [
      "3 connected accounts",
      "Daily AI content plans",
      "Hook + retention scoring",
      "Best-time-to-post engine",
      "Competitor tracking",
    ],
    cta: "Start 7-day free trial",
    popular: true,
  },
  {
    id: "growth",
    name: "Growth",
    price: 79,
    blurb: "For brands scaling fast",
    features: ["Unlimited accounts", "Everything in Pro", "Trend + virality alerts", "Priority AI + support"],
    cta: "Start 7-day free trial",
    popular: false,
  },
];

function fmtCount(n: number | null): string {
  if (n == null) return "–";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

export default function OnboardingFlow({
  igConfigured = false,
  igUsername = null,
  igStatus = "",
}: {
  igConfigured?: boolean;
  igUsername?: string | null;
  igStatus?: string;
}) {
  const router = useRouter();
  // Coming back from a successful Instagram OAuth, skip straight to analysis.
  const [phase, setPhase] = useState<Phase>(igStatus === "connected" ? "analyzing" : "connect");
  const [connected, setConnected] = useState<string[]>(igUsername ? ["Instagram"] : []);
  const [account, setAccount] = useState<Account>(null);
  const [extracted, setExtracted] = useState<Extracted>(null);
  const [analyzed, setAnalyzed] = useState(false);

  // confirm-phase fields (prefilled by the AI when extraction worked)
  const [niche, setNiche] = useState("");
  const [goal, setGoal] = useState("");
  const [brand, setBrand] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // analyzing / building tickers
  const [tickIndex, setTickIndex] = useState(0);
  const [buildIndex, setBuildIndex] = useState(0);
  const [buildDone, setBuildDone] = useState(false);
  const analysisStarted = useRef(false);

  const stepIndex =
    phase === "connect" ? 0 : phase === "analyzing" || phase === "confirm" ? 1 : phase === "building" ? 2 : 3;
  const bSteps = useMemo(() => buildingSteps(niche), [niche]);
  const plan = useMemo(() => planFor(niche), [niche]);
  const liveIg = Boolean(igUsername) || igStatus === "connected";

  function toggle(id: string) {
    setConnected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function saveProfile() {
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche,
          brand_name: brand,
          goals: goal,
          platforms: connected,
          account_connected: connected.length > 0 || liveIg,
        }),
      });
    } catch {
      // best effort; the wizard continues regardless
    }
  }

  // ---- analyzing phase: tick the checklist AND run the real extraction ----
  useEffect(() => {
    if (phase !== "analyzing") return;
    setTickIndex(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= ANALYZE_STEPS.length; i++) {
      timers.push(setTimeout(() => setTickIndex(i), i * 1100));
    }
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  useEffect(() => {
    if (phase !== "analyzing" || analysisStarted.current) return;
    analysisStarted.current = true;
    const minWait = new Promise((r) => setTimeout(r, ANALYZE_STEPS.length * 1100 + 500));
    const run = fetch("/api/analyze-account")
      .then((r) => (r.ok ? r.json() : { connected: false }))
      .catch(() => ({ connected: false }));
    Promise.all([run, minWait]).then(([res]) => {
      if (res?.account) setAccount(res.account);
      if (res?.extracted) {
        setExtracted(res.extracted);
        setNiche(res.extracted.niche || "");
        setBrand(res.extracted.brand_name || res.account?.username || "");
        const g = GOALS.find((x) => x.id === res.extracted.goal);
        setGoal(g ? g.id : res.extracted.goal || "");
        setAnalyzed(true);
      }
      setPhase("confirm");
    });
  }, [phase]);

  // ---- building phase ticker ----
  useEffect(() => {
    if (phase !== "building") return;
    setBuildIndex(0);
    setBuildDone(false);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= bSteps.length; i++) {
      timers.push(setTimeout(() => setBuildIndex(i), i * 1100));
    }
    timers.push(setTimeout(() => setBuildDone(true), bSteps.length * 1100 + 800));
    return () => timers.forEach(clearTimeout);
  }, [phase, bSteps.length]);

  function fromConnect() {
    if (liveIg) {
      setPhase("analyzing");
    } else {
      // Nothing live to read; set up by hand instead of pretending to analyze.
      setPhase("confirm");
    }
  }

  async function fromConfirm() {
    setLoading(true);
    await saveProfile();
    setLoading(false);
    setPhase("building");
  }

  async function finish(planId: string) {
    setLoading(true);
    setErr(null);
    try {
      await saveProfile();
      // Payment isn't wired yet; every path lands on the dashboard. The chosen
      // plan / trial intent is passed along so billing can be wired later.
      router.push(`/dashboard?welcome=1&plan=${planId}`);
      router.refresh();
    } catch {
      setErr("Couldn't finish setup. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="ob-root">
      <div className="ob-aurora" aria-hidden />
      <div className="ob-shell">
        <div className="ob-progress">
          <div className="ob-brand">
            <BrandMark size={30} /> SOCIA
          </div>
          <div className="ob-steps">
            {STEPS.map((s, i) => (
              <div key={s} className={`ob-step ${i < stepIndex ? "done" : ""} ${i === stepIndex ? "on" : ""}`}>
                <span className="ob-step-dot">{i < stepIndex ? <Check size={12} /> : i + 1}</span>
                <span className="ob-step-label">{s}</span>
              </div>
            ))}
            <div className="ob-track">
              <div className="ob-fill" style={{ width: `${(stepIndex / (STEPS.length - 1)) * 100}%` }} />
            </div>
          </div>
        </div>

        {/* ---------- 1 · CONNECT ---------- */}
        {phase === "connect" && (
          <div className="ob-stage" key="connect">
            <div className="ob-head ob-rise">
              <span className="ob-eyebrow"><Sparkles size={13} /> Step 1</span>
              <h1>Connect your accounts</h1>
              <p>
                Link where you post and SOCIA reads your account itself: your niche, your
                content, and how it's doing. No forms to fill.
              </p>
            </div>
            {igStatus === "denied" && (
              <div className="ob-err ob-rise">Instagram connection was cancelled. Try again when you're ready.</div>
            )}
            {igStatus === "error" && (
              <div className="ob-err ob-rise">Something went wrong connecting Instagram. Try again.</div>
            )}
            <div className="ob-rise" style={{ animationDelay: "80ms" }}>
              <ConnectAccounts
                connected={connected}
                onToggle={toggle}
                instagramHref={igConfigured ? "/api/auth/instagram/start?next=onboarding" : undefined}
                igUsername={igUsername}
              />
            </div>
            <p className="ob-note ob-rise" style={{ animationDelay: "150ms" }}>
              Instagram connects live today. Other platforms register now and sync as each
              platform approves API access.
            </p>
            <div className="ob-actions ob-rise" style={{ animationDelay: "200ms" }}>
              <span />
              <button className="ob-btn ob-btn-primary" onClick={fromConnect}>
                {liveIg ? (<>Analyze my account <ScanSearch size={17} /></>) : connected.length ? (<>Continue <ArrowRight size={17} /></>) : (<>Set up without connecting <ArrowRight size={17} /></>)}
              </button>
            </div>
          </div>
        )}

        {/* ---------- 2 · ANALYZING ---------- */}
        {phase === "analyzing" && (
          <div className="ob-stage ob-build" key="analyzing">
            <div className="ob-orb">
              <span className="ob-orb-core" />
              <span className="ob-orb-ring" />
              <span className="ob-orb-ring ob-orb-ring2" />
              <ScanSearch size={30} className="ob-orb-spark" />
            </div>
            <h1 className="ob-rise">Reading your account…</h1>
            <p className="ob-rise" style={{ animationDelay: "60ms" }}>
              The AI is studying {igUsername ? <b>@{igUsername}</b> : <b>your account</b>} so you
              don't have to explain yourself.
            </p>
            <div className="ob-buildlist">
              {ANALYZE_STEPS.map((s, i) => (
                <div key={s} className={`ob-buildrow ${i < tickIndex ? "done" : ""} ${i === tickIndex ? "active" : ""}`}>
                  <span className="ob-buildcheck">
                    {i < tickIndex ? <Check size={14} /> : <span className="ob-buildspin" />}
                  </span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---------- 2b · CONFIRM ---------- */}
        {phase === "confirm" && (
          <div className="ob-stage" key="confirm">
            <div className="ob-head ob-rise">
              {analyzed ? (
                <>
                  <span className="ob-eyebrow ob-eyebrow-ok"><Check size={13} /> Account read</span>
                  <h1>Here's what we found</h1>
                  <p>{extracted?.summary || "We read your account. Check this over and adjust anything."}</p>
                </>
              ) : (
                <>
                  <span className="ob-eyebrow"><Sparkles size={13} /> Quick setup</span>
                  <h1>Tell us about your account</h1>
                  <p>
                    {liveIg
                      ? "We couldn't read your account data yet, so set this up by hand. Takes 20 seconds."
                      : "No live account connected yet, so set this up by hand. Takes 20 seconds."}
                  </p>
                </>
              )}
            </div>

            {analyzed && account && (
              <div className="ob-acct ob-pop">
                <span className="ob-acct-avatar">{(account.username || "?").charAt(0).toUpperCase()}</span>
                <div className="ob-acct-meta">
                  <b>@{account.username}</b>
                  <small>{account.name || "Instagram"}</small>
                </div>
                <div className="ob-acct-stats">
                  <span><b>{fmtCount(account.followers)}</b><small>Followers</small></span>
                  <span><b>{fmtCount(account.media_count)}</b><small>Posts</small></span>
                  <span><b>{extracted?.best_format || "–"}</b><small>Top format</small></span>
                </div>
              </div>
            )}

            {analyzed && extracted?.highlights?.length ? (
              <div className="ob-insights">
                {extracted.highlights.map((h, i) => (
                  <div key={i} className="ob-insight ob-pop" style={{ animationDelay: `${120 + i * 80}ms` }}>
                    <Sparkles size={14} /> <span>{h}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="ob-field ob-rise" style={{ animationDelay: "160ms" }}>
              <label>{analyzed ? "Your niche (detected)" : "Your niche"}</label>
              <div className="ob-select-wrap">
                <select value={niche} onChange={(e) => setNiche(e.target.value)}>
                  <option value="" disabled>Choose your category…</option>
                  {NICHES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ob-field ob-rise" style={{ animationDelay: "220ms" }}>
              <label>{analyzed ? "Your goal (our best guess)" : "Your main goal"}</label>
              <div className="ob-goalgrid">
                {GOALS.map((g, i) => (
                  <button
                    key={g.id}
                    type="button"
                    className={`ob-goal ${goal === g.id ? "on" : ""}`}
                    style={{ animationDelay: `${240 + i * 45}ms` }}
                    onClick={() => setGoal(g.id)}
                  >
                    <span className="ob-goal-ico">{g.icon}</span>
                    <span>{g.label}</span>
                    {goal === g.id && <span className="ob-goal-check"><Check size={13} /></span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="ob-field ob-rise" style={{ animationDelay: "300ms" }}>
              <label>Account or brand name <span className="ob-opt">(optional)</span></label>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="@yourhandle or your business name" />
            </div>

            {err && <div className="ob-err">{err}</div>}
            <div className="ob-actions ob-rise" style={{ animationDelay: "340ms" }}>
              <button className="ob-btn ob-btn-ghost" onClick={() => setPhase("connect")}>
                <ArrowLeft size={17} /> Back
              </button>
              <button className="ob-btn ob-btn-primary" disabled={!niche || !goal || loading} onClick={fromConfirm}>
                {loading ? "Saving…" : "Build my plan"} {!loading && <Wand2 size={17} />}
              </button>
            </div>
          </div>
        )}

        {/* ---------- 3 · BUILDING → PLAN ---------- */}
        {phase === "building" && !buildDone && (
          <div className="ob-stage ob-build" key="building">
            <div className="ob-orb">
              <span className="ob-orb-core" />
              <span className="ob-orb-ring" />
              <span className="ob-orb-ring ob-orb-ring2" />
              <Sparkles size={30} className="ob-orb-spark" />
            </div>
            <h1 className="ob-rise">Building your strategy…</h1>
            <p className="ob-rise" style={{ animationDelay: "60ms" }}>
              Your AI strategist is designing a plan for <b>{niche || "your account"}</b>.
            </p>
            <div className="ob-buildlist">
              {bSteps.map((s, i) => (
                <div key={s} className={`ob-buildrow ${i < buildIndex ? "done" : ""} ${i === buildIndex ? "active" : ""}`}>
                  <span className="ob-buildcheck">
                    {i < buildIndex ? <Check size={14} /> : <span className="ob-buildspin" />}
                  </span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {phase === "building" && buildDone && (
          <div className="ob-stage" key="plan">
            <div className="ob-head ob-rise">
              <span className="ob-eyebrow ob-eyebrow-ok"><Check size={13} /> Ready</span>
              <h1>Your first week is ready 🎉</h1>
              <p>
                A starter plan tuned for <b>{niche}</b>. This is a taste. Your full plan
                updates daily inside SOCIA.
              </p>
            </div>
            <div className="ob-plan">
              {plan.map((p, i) => (
                <div key={i} className="ob-plancard ob-pop" style={{ animationDelay: `${i * 90}ms` }}>
                  <div className="ob-plan-top">
                    <span className="ob-plan-day">{p.day}</span>
                    <span className="ob-plan-format">{p.format}</span>
                    <span className="ob-plan-score">{p.score}</span>
                  </div>
                  <p className="ob-plan-hook">"{p.hook}"</p>
                  <span className="ob-plan-tag">{p.tag}</span>
                </div>
              ))}
            </div>
            <div className="ob-actions ob-rise" style={{ animationDelay: "200ms" }}>
              <span />
              <button className="ob-btn ob-btn-primary" onClick={() => setPhase("pricing")}>
                See my full plan <ArrowRight size={17} />
              </button>
            </div>
          </div>
        )}

        {/* ---------- 4 · PRICING ---------- */}
        {phase === "pricing" && (
          <div className="ob-stage" key="pricing">
            <div className="ob-head ob-rise">
              <span className="ob-eyebrow"><Rocket size={13} /> Last step</span>
              <h1>Start free for 7 days</h1>
              <p>Full access, no charge today. Cancel anytime before the trial ends.</p>
            </div>
            <div className="ob-plans">
              {PLANS.map((pl, i) => (
                <div key={pl.id} className={`ob-pricecard ob-pop ${pl.popular ? "popular" : ""}`} style={{ animationDelay: `${i * 80}ms` }}>
                  {pl.popular && <span className="ob-badge">Most popular</span>}
                  <div className="ob-price-name">{pl.name}</div>
                  <div className="ob-price-amt">
                    {pl.price === 0 ? <b>Free</b> : (<><b>${pl.price}</b><span>/mo</span></>)}
                  </div>
                  <div className="ob-price-blurb">{pl.blurb}</div>
                  <ul className="ob-price-feats">
                    {pl.features.map((f) => (
                      <li key={f}><Check size={14} /> {f}</li>
                    ))}
                  </ul>
                  <button
                    className={`ob-btn ${pl.popular ? "ob-btn-primary" : "ob-btn-outline"} ob-price-cta`}
                    disabled={loading}
                    onClick={() => finish(pl.id)}
                  >
                    {loading ? "Setting up…" : pl.cta}
                  </button>
                  {pl.price > 0 && <span className="ob-price-note">then ${pl.price}/mo · cancel anytime</span>}
                </div>
              ))}
            </div>
            {err && <div className="ob-err">{err}</div>}
            <div className="ob-skiprow ob-rise" style={{ animationDelay: "260ms" }}>
              <button className="ob-textlink" onClick={() => finish("starter")} disabled={loading}>
                Maybe later, take me to my dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

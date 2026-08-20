"use client";

import { useEffect, useMemo, useState } from "react";
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
  Clock,
  TrendingUp,
  Wand2,
} from "lucide-react";
import { NICHES } from "./ProfileForm";
import ConnectAccounts from "./ConnectAccounts";

type Phase = "goals" | "connect" | "building" | "pricing";

const GOALS = [
  { id: "Grow my followers", label: "Grow followers", icon: <Users size={20} /> },
  { id: "More engagement", label: "More engagement", icon: <Heart size={20} /> },
  { id: "Drive sales & bookings", label: "Drive sales", icon: <ShoppingBag size={20} /> },
  { id: "Build my personal brand", label: "Personal brand", icon: <Star size={20} /> },
  { id: "Get leads & clients", label: "Leads & clients", icon: <Briefcase size={20} /> },
  { id: "Monetize my audience", label: "Monetize", icon: <DollarSign size={20} /> },
];

const STEPS = ["Your goals", "Connect", "Your plan", "Choose plan"];

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
    {
      day: "Mon",
      format: "Reel",
      hook: `3 ${n} mistakes quietly killing your reach`,
      tag: "High hook score",
      score: 92,
    },
    {
      day: "Wed",
      format: "Carousel",
      hook: `The ${n} starter kit nobody talks about`,
      tag: "Save-worthy",
      score: 88,
    },
    {
      day: "Fri",
      format: "Reel",
      hook: `I tried this for 30 days — here's what changed`,
      tag: "Story-driven",
      score: 90,
    },
    {
      day: "Sun",
      format: "Story",
      hook: `Behind the scenes of my ${n} process`,
      tag: "Builds trust",
      score: 85,
    },
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
    features: [
      "Unlimited accounts",
      "Everything in Pro",
      "Trend + virality alerts",
      "Priority AI + support",
    ],
    cta: "Start 7-day free trial",
    popular: false,
  },
];

export default function OnboardingFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("goals");
  const [niche, setNiche] = useState("");
  const [goal, setGoal] = useState("");
  const [brand, setBrand] = useState("");
  const [connected, setConnected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // building animation state
  const [buildIndex, setBuildIndex] = useState(0);
  const [buildDone, setBuildDone] = useState(false);

  const stepIndex = phase === "goals" ? 0 : phase === "connect" ? 1 : phase === "building" ? 2 : 3;
  const steps = useMemo(() => buildingSteps(niche), [niche]);
  const plan = useMemo(() => planFor(niche), [niche]);

  function toggle(id: string) {
    setConnected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function saveProfile(markConnected: boolean) {
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche,
          brand_name: brand,
          goals: goal,
          platforms: connected,
          account_connected: markConnected && connected.length > 0,
        }),
      });
    } catch {
      // best effort; the wizard continues regardless
    }
  }

  // run the "building your plan" sequence when we enter that phase
  useEffect(() => {
    if (phase !== "building") return;
    setBuildIndex(0);
    setBuildDone(false);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let i = 0;
    const tick = () => {
      i += 1;
      if (i < steps.length) {
        setBuildIndex(i);
        timers.push(setTimeout(tick, 1150));
      } else {
        setBuildIndex(steps.length);
        timers.push(setTimeout(() => setBuildDone(true), 900));
      }
    };
    timers.push(setTimeout(tick, 1150));
    return () => timers.forEach(clearTimeout);
  }, [phase, steps.length]);

  async function goToBuilding() {
    setLoading(true);
    await saveProfile(true);
    setLoading(false);
    setPhase("building");
  }

  async function finish(planId: string) {
    setLoading(true);
    setErr(null);
    try {
      await saveProfile(true);
      // Payment isn't wired yet — every path lands on the dashboard. The chosen
      // plan / trial intent is passed along so we can wire billing later.
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
        {/* progress */}
        <div className="ob-progress">
          <div className="ob-brand">
            <span className="side-mark">S</span> SOCIA
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

        {/* ---------- GOALS ---------- */}
        {phase === "goals" && (
          <div className="ob-stage" key="goals">
            <div className="ob-head ob-rise" style={{ animationDelay: "0ms" }}>
              <span className="ob-eyebrow"><Sparkles size={13} /> Let's tailor SOCIA to you</span>
              <h1>What are you growing?</h1>
              <p>Pick your niche and your #1 goal — your AI strategist builds everything around this.</p>
            </div>

            <div className="ob-field ob-rise" style={{ animationDelay: "70ms" }}>
              <label>Your niche</label>
              <div className="ob-select-wrap">
                <select value={niche} onChange={(e) => setNiche(e.target.value)}>
                  <option value="" disabled>Choose your category…</option>
                  {NICHES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ob-field ob-rise" style={{ animationDelay: "140ms" }}>
              <label>Your main goal</label>
              <div className="ob-goalgrid">
                {GOALS.map((g, i) => (
                  <button
                    key={g.id}
                    type="button"
                    className={`ob-goal ${goal === g.id ? "on" : ""}`}
                    style={{ animationDelay: `${160 + i * 45}ms` }}
                    onClick={() => setGoal(g.id)}
                  >
                    <span className="ob-goal-ico">{g.icon}</span>
                    <span>{g.label}</span>
                    {goal === g.id && <span className="ob-goal-check"><Check size={13} /></span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="ob-field ob-rise" style={{ animationDelay: "220ms" }}>
              <label>Account or brand name <span className="ob-opt">— optional</span></label>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="@yourhandle or your business name" />
            </div>

            <div className="ob-actions ob-rise" style={{ animationDelay: "280ms" }}>
              <span />
              <button className="ob-btn ob-btn-primary" disabled={!niche || !goal} onClick={() => setPhase("connect")}>
                Continue <ArrowRight size={17} />
              </button>
            </div>
          </div>
        )}

        {/* ---------- CONNECT ---------- */}
        {phase === "connect" && (
          <div className="ob-stage" key="connect">
            <div className="ob-head ob-rise">
              <span className="ob-eyebrow"><Sparkles size={13} /> Step 2</span>
              <h1>Connect your accounts</h1>
              <p>Link the platforms you post to so SOCIA can pull your real numbers and tailor every plan.</p>
            </div>
            <div className="ob-rise" style={{ animationDelay: "80ms" }}>
              <ConnectAccounts connected={connected} onToggle={toggle} />
            </div>
            <p className="ob-note ob-rise" style={{ animationDelay: "150ms" }}>
              Connecting registers the account so your dashboard reflects it — live sync switches on as each platform approves API access.
            </p>
            {err && <div className="ob-err">{err}</div>}
            <div className="ob-actions ob-rise" style={{ animationDelay: "200ms" }}>
              <button className="ob-btn ob-btn-ghost" onClick={() => setPhase("goals")}>
                <ArrowLeft size={17} /> Back
              </button>
              <button className="ob-btn ob-btn-primary" disabled={loading} onClick={goToBuilding}>
                {loading ? "Saving…" : connected.length ? "Build my plan" : "Skip — build my plan"}
                {!loading && <Wand2 size={17} />}
              </button>
            </div>
          </div>
        )}

        {/* ---------- BUILDING → PLAN ---------- */}
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
              {steps.map((s, i) => (
                <div
                  key={s}
                  className={`ob-buildrow ${i < buildIndex ? "done" : ""} ${i === buildIndex ? "active" : ""}`}
                >
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
              <p>A starter plan tuned for <b>{niche}</b>. This is a taste — your full plan updates daily inside SOCIA.</p>
            </div>
            <div className="ob-plan">
              {plan.map((p, i) => (
                <div key={i} className="ob-plancard ob-pop" style={{ animationDelay: `${i * 90}ms` }}>
                  <div className="ob-plan-top">
                    <span className="ob-plan-day">{p.day}</span>
                    <span className="ob-plan-format">{p.format}</span>
                    <span className="ob-plan-score">{p.score}</span>
                  </div>
                  <p className="ob-plan-hook">“{p.hook}”</p>
                  <span className="ob-plan-tag">{p.tag}</span>
                </div>
              ))}
            </div>
            <div className="ob-actions ob-rise" style={{ animationDelay: "200ms" }}>
              <span />
              <button className="ob-btn ob-btn-primary" onClick={() => setPhase("pricing")}>
                Unlock my full plan <ArrowRight size={17} />
              </button>
            </div>
          </div>
        )}

        {/* ---------- PRICING ---------- */}
        {phase === "pricing" && (
          <div className="ob-stage" key="pricing">
            <div className="ob-head ob-rise">
              <span className="ob-eyebrow"><Rocket size={13} /> Last step</span>
              <h1>Start free for 7 days</h1>
              <p>Full access, no charge today. Cancel anytime before the trial ends.</p>
            </div>
            <div className="ob-plans">
              {PLANS.map((pl, i) => (
                <div
                  key={pl.id}
                  className={`ob-pricecard ob-pop ${pl.popular ? "popular" : ""}`}
                  style={{ animationDelay: `${i * 80}ms` }}
                >
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
                Maybe later — take me to my dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

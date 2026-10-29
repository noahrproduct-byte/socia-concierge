"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Users,
  Heart,
  ShoppingBag,
  Star,
  Briefcase,
  DollarSign,
  ScanSearch,
  Loader2,
} from "lucide-react";
import { NICHES } from "@/lib/niches";
import { PLANS, PLAN_ORDER, LIMIT_UNIT, formatPrice, pricingHref, type PlanConfig, type PlanId } from "@/lib/plans";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import PlanNotice from "@/components/PlanNotice";
import ConnectAccounts, { type ConnectState } from "./ConnectAccounts";
import BrandMark from "./BrandMark";

type Phase = "connect" | "analyzing" | "confirm" | "pricing";

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

const STEPS = ["Connect", "Your account", "Choose plan"];

/* Compact, real inclusions per plan, read from lib/plans.ts so this screen
   can never promise something enforcement does not grant. */
function planHighlights(pl: PlanConfig): string[] {
  const workspaces = pl.limits.workspaces;
  const competitors = pl.limits.competitors;
  return [
    `${workspaces} ${workspaces === 1 ? LIMIT_UNIT.workspaces.one : LIMIT_UNIT.workspaces.many}`,
    `${competitors} ${competitors === 1 ? LIMIT_UNIT.competitors.one : LIMIT_UNIT.competitors.many}`,
    `${pl.meters.ask_socia} Ask SOCIA questions a month`,
  ];
}

function fmtCount(n: number | null): string {
  if (n == null) return "–";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

/** A platform's ?<key>= return code from its OAuth callback, in words. */
const RETURN_ERRORS: Record<string, string> = {
  denied: "connection was cancelled. Try again when you're ready.",
  error: "didn't connect. Try again, or connect it later from Settings.",
  limit: "is over your plan's account limit. Compare plans from Settings.",
  forbidden: "can only be connected by the workspace owner or an Admin.",
  notconfigured: "isn't set up on this site yet.",
  noperm: "didn't grant Page access. Try again and allow Pages.",
  nopages: "returned no Pages for this login.",
  nochannel: "found no channel on that Google account.",
  noprofile: "didn't return a profile. Try again.",
  elsewhere: "account is already connected to another of your brands. Disconnect it there first.",
};

export default function OnboardingFlow({
  connections,
  igUsername = null,
  igStatus = "",
  returned = [],
}: {
  /** Real connection state per platform, read on the server. */
  connections: ConnectState[];
  igUsername?: string | null;
  igStatus?: string;
  /** Return codes from the platform callbacks, e.g. { name: "YouTube", code: "denied" }. */
  returned?: { name: string; code: string }[];
}) {
  const router = useRouter();
  // Coming back from a successful Instagram OAuth, skip straight to analysis.
  const [phase, setPhase] = useState<Phase>(igStatus === "connected" ? "analyzing" : "connect");
  const connected = connections.filter((c) => c.connectedAs).map((c) => c.id);
  const [account, setAccount] = useState<Account>(null);
  const [extracted, setExtracted] = useState<Extracted>(null);
  const [analyzed, setAnalyzed] = useState(false);
  // The audit was refused by the plan (403 PlanError): shown on the confirm
  // step in place of the generic "couldn't read" line, manual setup still works.
  const [planError, setPlanError] = useState<PlanError | null>(null);

  // confirm-phase fields (prefilled by the AI when extraction worked)
  const [niche, setNiche] = useState("");
  const [goal, setGoal] = useState("");
  const [brand, setBrand] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const analysisStarted = useRef(false);

  const stepIndex = phase === "connect" ? 0 : phase === "pricing" ? 2 : 1;
  const liveIg = Boolean(igUsername) || igStatus === "connected";

  async function saveProfile() {
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche,
          brand_name: brand,
          goals: goal,
          // Only platforms with a real connection row; never a self-reported one.
          platforms: connected,
          ...(liveIg ? { account_connected: true } : {}),
        }),
      });
    } catch {
      // best effort; the wizard continues regardless
    }
  }

  // ---- analyzing phase: the real account read, for as long as it takes ----
  useEffect(() => {
    if (phase !== "analyzing" || analysisStarted.current) return;
    analysisStarted.current = true;
    fetch("/api/analyze-account")
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (r.ok) return j ?? { connected: false };
        if (isPlanError(j)) setPlanError(j);
        return { connected: false };
      })
      .catch(() => ({ connected: false }))
      .then((res) => {
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
    setPhase("pricing");
  }

  // Everyone starts on Free; there is no checkout here. Paid cards are links
  // to /pricing, so the only plan that reaches this is Free and the dashboard
  // reads nothing from the URL beyond welcome=1.
  async function finish(_planId: PlanId) {
    setLoading(true);
    setErr(null);
    try {
      await saveProfile();
      router.push("/dashboard?welcome=1");
      router.refresh();
    } catch {
      setErr("Couldn't finish setup. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="ob-root">
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
            <div className="ob-head">
              <span className="ob-eyebrow">Step 1</span>
              <h1>Connect your accounts</h1>
              <p>
                Connect the accounts you post from. SOCIA reads your posts and numbers from
                each platform; with Instagram connected it also suggests your niche.
              </p>
            </div>
            {igStatus && igStatus !== "connected" && RETURN_ERRORS[igStatus] && (
              <div className="ob-err">Instagram {RETURN_ERRORS[igStatus]}</div>
            )}
            {returned.filter((r) => RETURN_ERRORS[r.code]).map((r) => (
              <div className="ob-err" key={r.name}>{r.name} {RETURN_ERRORS[r.code]}</div>
            ))}
            <ConnectAccounts states={connections} />
            <p className="ob-note">
              Each Connect button opens that platform&apos;s own sign-in and brings you back here.
              You can connect more later from Settings.
            </p>
            <div className="ob-actions">
              <span />
              <button className="ob-btn ob-btn-primary" onClick={fromConnect}>
                {liveIg ? (<>Read my Instagram <ScanSearch size={17} /></>) : connected.length ? (<>Continue <ArrowRight size={17} /></>) : (<>Set up without connecting <ArrowRight size={17} /></>)}
              </button>
            </div>
          </div>
        )}

        {/* ---------- 2 · ANALYZING ---------- */}
        {phase === "analyzing" && (
          <div className="ob-stage ob-reading" key="analyzing" role="status" aria-live="polite">
            <Loader2 size={22} className="spin" aria-hidden />
            <h1>Reading {igUsername ? <>@{igUsername}</> : "your Instagram"}</h1>
            <p>
              SOCIA is reading your profile and recent posts to suggest your niche and goal.
            </p>
          </div>
        )}

        {/* ---------- 2b · CONFIRM ---------- */}
        {phase === "confirm" && (
          <div className="ob-stage" key="confirm">
            <div className="ob-head">
              {analyzed ? (
                <>
                  <span className="ob-eyebrow ob-eyebrow-ok"><Check size={13} /> Account read</span>
                  <h1>Here&apos;s what we found</h1>
                  <p>{extracted?.summary || "We read your account. Check this over and adjust anything."}</p>
                </>
              ) : (
                <>
                  <span className="ob-eyebrow">Quick setup</span>
                  <h1>Tell us about your account</h1>
                  {planError ? (
                    <PlanNotice error={planError} compact />
                  ) : (
                    <p>
                      {liveIg
                        ? "SOCIA couldn't read your Instagram just now, so choose these yourself."
                        : connected.length
                          ? "SOCIA suggests a niche from Instagram only, so choose these yourself."
                          : "No account is connected yet, so choose these yourself."}
                    </p>
                  )}
                </>
              )}
            </div>

            {analyzed && account && (
              <div className="ob-acct">
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
              <ul className="ob-insights" aria-label="Read from your posts">
                {extracted.highlights.map((h, i) => (
                  <li key={i} className="ob-insight">{h}</li>
                ))}
              </ul>
            ) : null}

            <div className="ob-field">
              <label>{analyzed ? "Your niche (suggested from your posts)" : "Your niche"}</label>
              <div className="ob-select-wrap">
                <select value={niche} onChange={(e) => setNiche(e.target.value)}>
                  <option value="" disabled>Choose your category…</option>
                  {NICHES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ob-field">
              <label>{analyzed ? "Your goal (our best guess)" : "Your main goal"}</label>
              <div className="ob-goalgrid">
                {GOALS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={`ob-goal ${goal === g.id ? "on" : ""}`}
                    onClick={() => setGoal(g.id)}
                  >
                    <span className="ob-goal-ico">{g.icon}</span>
                    <span>{g.label}</span>
                    {goal === g.id && <span className="ob-goal-check"><Check size={13} /></span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="ob-field">
              <label>Account or brand name <span className="ob-opt">(optional)</span></label>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="@yourhandle or your business name" />
            </div>

            {err && <div className="ob-err">{err}</div>}
            <div className="ob-actions">
              <button className="ob-btn ob-btn-ghost" onClick={() => setPhase("connect")}>
                <ArrowLeft size={17} /> Back
              </button>
              <button className="ob-btn ob-btn-primary" disabled={!niche || !goal || loading} onClick={fromConfirm}>
                {loading ? "Saving…" : "Save and continue"} {!loading && <ArrowRight size={17} />}
              </button>
            </div>
          </div>
        )}

        {/* ---------- 3 · PRICING ---------- */}
        {phase === "pricing" && (
          <div className="ob-stage" key="pricing">
            <div className="ob-head">
              <span className="ob-eyebrow">Last step</span>
              <h1>Start on Free</h1>
              <p>Compare plans anytime from Settings.</p>
            </div>
            <div className="ob-plans">
              {PLAN_ORDER.map((id) => {
                const pl = PLANS[id];
                const isFree = pl.priceMonthly === 0;
                return (
                  <div key={pl.id} className={`ob-pricecard ${pl.popular ? "popular" : ""}`}>
                    {pl.popular && <span className="ob-badge">Recommended</span>}
                    <div className="ob-price-name">{pl.name}</div>
                    <div className="ob-price-amt">
                      {isFree ? <b>Free</b> : (<><b>{formatPrice(pl)}</b><span>/mo</span></>)}
                    </div>
                    <ul className="ob-price-feats">
                      {planHighlights(pl).map((f) => (
                        <li key={f}><Check size={14} /> {f}</li>
                      ))}
                    </ul>
                    {isFree ? (
                      <button
                        className="ob-btn ob-btn-primary ob-price-cta"
                        disabled={loading}
                        onClick={() => finish("free")}
                      >
                        {loading ? "Setting up…" : "Continue free"}
                      </button>
                    ) : (
                      <Link href={pricingHref(pl.id)} className="ob-btn ob-btn-outline ob-price-cta">
                        See {pl.name}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
            {err && <div className="ob-err">{err}</div>}
            <div className="ob-skiprow">
              <button className="ob-textlink" onClick={() => finish("free")} disabled={loading}>
                Maybe later, take me to my dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

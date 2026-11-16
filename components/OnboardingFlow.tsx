"use client";

// Setting up a brand, kept short: connect the accounts, let SOCIA read them,
// confirm what it found (every inferred field is editable and says how sure
// SOCIA is), pick one main goal, then see the work that really ran and the
// first briefing. Each step saves where its answers belong (brand_detail
// through /api/profile, goals through /api/goals) and records the step
// (/api/onboarding), so leaving and coming back resumes here. Required for a
// brand's owner (lib/onboarding.ts). Deeper questions live in Settings.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { NICHES } from "@/lib/niches";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import { STEPS, STEP_LABEL, nextStep, prevStep, type Step } from "@/lib/onboarding";
import { ACCOUNT_TYPES, GOAL_PLATFORM_NAME, type AccountType, type GoalPlatform } from "@/lib/growth";
import { confidenceLabel, type Understanding } from "@/lib/intel/understanding";
import type { BrandDetail } from "@/lib/profile";
import { Field, Input } from "@/components/system";
import PlanNotice from "@/components/PlanNotice";
import { Choices } from "./growth/GrowthFields";
import ConnectAccounts, { type ConnectState } from "./ConnectAccounts";
import BrandMark from "./BrandMark";
import ReadReveal from "./ReadReveal";
import StrategyStep from "./onboarding/StrategyStep";
import PlanStep from "./onboarding/PlanStep";
import GoalStep, { type GoalStepHandle } from "./onboarding/GoalStep";
import StageList, { afterEvent, readLines, waiting, type StageState } from "./onboarding/StageList";
import { READ_STAGES, type ReadEvent, type ReadStageId } from "@/lib/intel/readStages";
import AnimatedChoice from "@/components/animated/AnimatedChoice";
import BrandRead, { brandReadToSave, seedBrandRead, type BrandReadValue } from "@/components/brand/BrandRead";

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

const PLATFORM_ID: Record<string, GoalPlatform> = { Instagram: "instagram", Facebook: "facebook", YouTube: "youtube", TikTok: "tiktok" };

type Initial = {
  step: Step;
  tableReady: boolean;
  niche: string | null;
  brandName: string | null;
  detail: BrandDetail | null;
};

const freshRead = (): Record<ReadStageId, StageState> => ({ accounts: waiting(), posts: waiting(), reels: waiting(), profile: waiting() });

/** How sure SOCIA is about an inferred value, and what it rests on. */
function Inferred({ confidence, evidence }: { confidence: number; evidence: string[] }) {
  return (
    <span className="ob-inferred">
      <b>{confidenceLabel(confidence)}</b>
      {evidence[0] && <>: {evidence[0]}</>}
    </span>
  );
}

export default function OnboardingFlow({
  connections,
  igStatus = "",
  returned = [],
  initial,
  planNotice = null,
  igInterrupted = false,
  brands = [],
}: {
  /** Real connection state per platform, read on the server. */
  connections: ConnectState[];
  igStatus?: string;
  /** Return codes from the platform callbacks, e.g. { name: "YouTube", code: "denied" }. */
  returned?: { name: string; code: string }[];
  initial: Initial;
  /** Said on the plan step, e.g. after a checkout that was cancelled. */
  planNotice?: string | null;
  /** An Instagram connection was started and didn't come back. */
  igInterrupted?: boolean;
  /** The brands this person can open; a switcher shows when there are several. */
  brands?: { id: string; name: string; active: boolean }[];
}) {
  const router = useRouter();
  const connected = connections.filter((c) => c.connectedAs).map((c) => c.id);
  const connectedPlatforms = connected.map((id) => PLATFORM_ID[id]).filter(Boolean);

  const d = initial.detail ?? {};
  const g0 = d.growth ?? {};
  const [step, setStep] = useState<Step>(initial.step);
  const [understanding, setUnderstanding] = useState<Understanding | null>(g0.understanding ?? null);
  const [reading, setReading] = useState(false);
  // The finished read, revealed once before the form (ReadReveal.tsx).
  const [revealing, setRevealing] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanError | null>(null);

  // Confirmed values: what the person already confirmed, else filled from what SOCIA inferred.
  const u = understanding;
  const [brandName, setBrandName] = useState(initial.brandName ?? "");
  const [accountType, setAccountType] = useState<AccountType | "">(g0.account_type ?? "");
  const [niche, setNiche] = useState(initial.niche ?? "");
  const [subcategory, setSubcategory] = useState(g0.niche_path?.subcategory ?? "");
  const [specific, setSpecific] = useState(g0.niche_path?.specific ?? "");
  const [audience, setAudience] = useState(g0.audience?.who ?? "");
  const [location, setLocation] = useState(d.location ?? "");
  // What the account is about and the kinds of video it posts, from watching its Reels; the person confirms or changes it.
  const [brandRead, setBrandRead] = useState<BrandReadValue>(() => seedBrandRead(g0.understanding?.visual, d));
  // The goal step keeps its own fields and saves them when asked (components/onboarding/GoalStep.tsx).
  const goalRef = useRef<GoalStepHandle>(null);
  const [goalCount, setGoalCount] = useState(g0.main_goal ? 1 : 0);
  const today = new Date().toISOString().slice(0, 10);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The strategy step says when its build has ended (done or failed), so "Open SOCIA" waits for it.
  const [strategyReady, setStrategyReady] = useState(false);
  const readStarted = useRef(false);
  const [readStages, setReadStages] = useState(freshRead);
  const headRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headRef.current?.focus();
  }, [step, reading]);

  /** Fill empty fields from the analysis; never overwrite what the person typed or confirmed. */
  function seedFrom(x: Understanding) {
    if (x.account_type) setAccountType((v) => v || x.account_type!.value);
    if (x.niche) {
      setNiche((v) => v || x.niche!.value.category);
      setSubcategory((v) => v || x.niche!.value.subcategory || "");
      setSpecific((v) => v || x.niche!.value.specific || "");
    }
    if (x.audience) setAudience((v) => v || x.audience!.value);
    if (x.geography?.value.place) setLocation((v) => v || x.geography!.value.place || "");
    const h = x.facts.find((f) => f.handle)?.handle;
    if (h) setBrandName((v) => v || h);
  }

  // Seed once from an analysis that already exists.
  useEffect(() => {
    if (understanding) seedFrom(understanding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const post = (url: string, body: unknown) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  // The account read: the real request, shown step by step as the server reports each one.
  async function readAccounts() {
    setReading(true);
    setReadError(null);
    setReadStages(freshRead());
    try {
      const res = await post("/api/understand?stream=1", {});
      let r: { ok: boolean } = res;
      let j: { understanding?: Understanding; error?: string } | null = null;
      if (res.ok && res.body && (res.headers.get("content-type") ?? "").includes("ndjson")) {
        let ended = false;
        await readLines<ReadEvent>(res, (e) => {
          if (e.type === "stage") setReadStages((cur) => ({ ...cur, [e.id]: afterEvent(cur[e.id], e) }));
          else if (e.type === "result") { ended = true; r = { ok: e.status >= 200 && e.status < 300 }; j = e.body as typeof j; }
        });
        // The connection ended without an answer: say so instead of waiting forever.
        if (!ended) throw new Error("dropped");
      } else {
        j = await res.json().catch(() => null);
      }
      if (!r.ok) {
        if (isPlanError(j)) setPlanError(j);
        else setReadError(j?.error ?? "SOCIA couldn't read your accounts just now.");
      } else if (j?.understanding) {
        setUnderstanding(j.understanding);
        seedFrom(j.understanding);
        // A fresh read fills the account section, unless the person already confirmed one.
        if (!d.description && !d.formats?.length) setBrandRead(seedBrandRead((j.understanding as Understanding).visual, d));
        if ((j.understanding as Understanding).facts?.length) setRevealing(true);
      }
    } catch {
      setReadError("SOCIA couldn't read your accounts just now.");
    } finally {
      setReading(false);
    }
  }

  // Entering "Your account" with accounts connected and no analysis yet runs it once.
  useEffect(() => {
    if (step !== "profile" || understanding || !connected.length || readStarted.current) return;
    readStarted.current = true;
    void readAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);


  async function saveProfile(): Promise<boolean> {
    const r = await post("/api/profile", {
      niche,
      brand_name: brandName,
      platforms: connected,
      ...(connected.includes("Instagram") ? { account_connected: true } : {}),
      brand_detail: {
        ...brandReadToSave(brandRead),
        location: location.trim() || undefined,
        growth: {
          account_type: accountType || undefined,
          niche_path: { subcategory, specific },
          audience: { who: audience },
        },
      },
    }).catch(() => null);
    if (!r?.ok) {
      const j = await r?.json().catch(() => null);
      setErr(j?.error || "Couldn't save this step. Try again.");
      return false;
    }
    return true;
  }

  /** The goal step validates and saves its own goals; the flow only shows what went wrong. */
  const saveGoal = async (): Promise<boolean> => (await goalRef.current?.save()) ?? false;

  async function go(to: Step, save: boolean) {
    setErr(null);
    if (save) {
      setSaving(true);
      const ok = step === "profile" ? await saveProfile() : step === "goal" ? await saveGoal() : true;
      setSaving(false);
      if (!ok) return;
    }
    // Progress is bookkeeping: if it can't be saved, the answers above still were.
    void post("/api/onboarding", { step: to }).catch(() => null);
    setStep(to);
  }

  async function finish() {
    setSaving(true);
    setErr(null);
    const r = await post("/api/onboarding", { step: "plan", completed: true }).catch(() => null);
    // Before the database update the row can't be saved; the niche alone then
    // marks setup as done (lib/onboarding.ts), so the app still opens.
    if (!r?.ok && r?.status !== 503) {
      setSaving(false);
      setErr("Couldn't finish setup. Try again.");
      return;
    }
    router.push("/dashboard?welcome=1");
    router.refresh();
  }

  const i = STEPS.indexOf(step);
  const canNext = step === "profile" ? Boolean(niche && accountType) : step === "goal" ? goalCount > 0 : true;

  const nav = (next = "Continue") => (
    <>
      {err && <div className="ob-err" role="alert">{err}</div>}
      <div className="ob-actions">
        {i > 0 ? (
          <button className="ob-btn ob-btn-ghost" onClick={() => go(prevStep(step), false)} disabled={saving}>
            <ArrowLeft size={17} /> Back
          </button>
        ) : <span />}
        <button className="ob-btn ob-btn-primary" onClick={() => go(nextStep(step), true)} disabled={!canNext || saving}>
          {saving ? "Saving…" : next} {!saving && <ArrowRight size={17} />}
        </button>
      </div>
    </>
  );

  return (
    <div className="ob-root">
      <div className="ob-shell">
        <div className="ob-progress">
          <div className="ob-brand">
            <BrandMark size={30} /> SOCIA
            {brands.length > 1 && (
              <label className="ob-switch">
                <span>Brand</span>
                <select
                  className="s-input"
                  value={brands.find((b) => b.active)?.id ?? ""}
                  onChange={async (e) => {
                    const r = await fetch(`/api/workspaces/${encodeURIComponent(e.target.value)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: true }) }).catch(() => null);
                    if (r?.ok) window.location.assign("/dashboard");
                    else setErr("Couldn't switch brand. Try again.");
                  }}
                >
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <p className="ob-stepline">
            Step {i + 1} of {STEPS.length}: {STEP_LABEL[step]}
          </p>
          <div className="ob-bar" aria-hidden>
            <i style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>

        {reading ? (
          <div className="ob-stage">
            <div className="ob-head">
              <h1 ref={headRef} tabIndex={-1}>Reading your accounts</h1>
              <p>SOCIA is working out what the account is about and how you post, from {connected.join(", ")}. Each step below is real work on your account. It takes about a minute.</p>
            </div>
            <StageList stages={READ_STAGES} states={readStages} busy />
          </div>
        ) : revealing && u ? (
          <ReadReveal understanding={u} onContinue={() => setRevealing(false)} />
        ) : (
          <div className="ob-stage" key={step}>
            {step === "connect" && (
              <>
                <div className="ob-head">
                  <h1 ref={headRef} tabIndex={-1}>Connect your accounts</h1>
                  <p>SOCIA reads your profile and recent posts from each account you connect, so you don&apos;t have to describe them.</p>
                </div>
                {igStatus && igStatus !== "connected" && RETURN_ERRORS[igStatus] && <div className="ob-err">Instagram {RETURN_ERRORS[igStatus]}</div>}
                {igInterrupted && !connected.includes("Instagram") && (
                  <p className="obp-notice" role="status">Instagram didn&apos;t send you back to SOCIA. That happens when it stops to confirm it&apos;s you. You&apos;re signed in to Instagram now, so connect it again and it goes straight through.</p>
                )}
                {returned.filter((r) => RETURN_ERRORS[r.code]).map((r) => (
                  <div className="ob-err" key={r.name}>{r.name} {RETURN_ERRORS[r.code]}</div>
                ))}
                <ConnectAccounts states={connections} />
                <ul className="ob-reads">
                  <li><b>What SOCIA reads:</b> your profile, posts and the numbers each platform reports for them.</li>
                  <li><b>Why:</b> to measure what works for you and plan from your own results.</li>
                  <li><b>What it can&apos;t do:</b> post without you scheduling it, or see other accounts&apos; private numbers.</li>
                </ul>
                <div className="ob-actions">
                  <span />
                  <button className="ob-btn ob-btn-primary" onClick={() => go("profile", false)}>
                    {connected.length ? "Continue" : "Continue without connecting"} <ArrowRight size={17} />
                  </button>
                </div>
              </>
            )}

            {step === "profile" && (
              <>
                <div className="ob-head">
                  <h1 ref={headRef} tabIndex={-1}>{u?.niche || u?.account_type ? "Here's what SOCIA found" : "Tell SOCIA about the account"}</h1>
                  <p>
                    {u?.niche || u?.account_type
                      ? "Read from your posts. Check each line and change anything that's wrong."
                      : connected.length
                        ? "SOCIA couldn't infer these from your posts, so fill them in."
                        : "No account is connected yet, so fill these in. SOCIA reads more once you connect one."}
                  </p>
                </div>
                {planError && <PlanNotice error={planError} compact />}
                {readError && (
                  <div className="ob-err" role="alert">
                    {readError} <button type="button" className="ob-link" onClick={readAccounts}>Try again</button>
                  </div>
                )}

                {u && u.facts.length > 0 && (
                  <ul className="ob-facts" aria-label="Connected accounts">
                    {u.facts.map((f) => (
                      <li key={f.platform}>
                        <b>{GOAL_PLATFORM_NAME[f.platform]}{f.handle ? `, ${f.handle}` : ""}</b>
                        <span>
                          {[
                            f.followers != null ? `${f.followers.toLocaleString("en-US")} followers` : null,
                            `${f.postsSampled} recent posts read`,
                            f.postsPerWeek != null ? `${f.postsPerWeek} a week lately` : null,
                            f.formats[0] ? `mostly ${f.formats[0].format.toLowerCase()}s` : null,
                          ].filter(Boolean).join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="ob-fields">
                  <BrandRead visual={u?.visual} value={brandRead} onChange={setBrandRead} />
                  <Field label="Account or brand name">
                    <Input maxLength={80} value={brandName} placeholder="@yourhandle or your business name" onChange={(e) => setBrandName(e.target.value)} />
                  </Field>
                  <div className="ob-infield">
                    <Choices label="Account type" options={ACCOUNT_TYPES} value={accountType} onChange={(v) => setAccountType(v as AccountType)} />
                    {u?.account_type && <Inferred confidence={u.account_type.confidence} evidence={u.account_type.evidence} />}
                  </div>
                  <div className="ob-infield">
                    <div className="gp-row">
                      <Field label="Niche">
                        <select className="s-input" value={niche} onChange={(e) => setNiche(e.target.value)}>
                          <option value="" disabled>Choose a category…</option>
                          {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </Field>
                      <Field label="More specifically" optional>
                        <Input maxLength={60} value={subcategory} placeholder="e.g. Pizza" onChange={(e) => setSubcategory(e.target.value)} />
                      </Field>
                      <Field label="Narrower still" optional>
                        <Input maxLength={80} value={specific} placeholder="e.g. Neighbourhood pizzeria" onChange={(e) => setSpecific(e.target.value)} />
                      </Field>
                    </div>
                    {u?.niche && <Inferred confidence={u.niche.confidence} evidence={u.niche.evidence} />}
                  </div>
                  <div className="ob-infield">
                    <Field label="Who it's for" optional>
                      <Input maxLength={300} value={audience} placeholder="e.g. Families nearby who want a weekend treat" onChange={(e) => setAudience(e.target.value)} />
                    </Field>
                    {u?.audience && <Inferred confidence={u.audience.confidence} evidence={u.audience.evidence} />}
                  </div>
                  <div className="ob-infield">
                    <Field label="Location" optional>
                      <Input maxLength={120} value={location} placeholder="e.g. Hermitage, TN" onChange={(e) => setLocation(e.target.value)} />
                    </Field>
                    {u?.geography?.value.place && <Inferred confidence={u.geography.confidence} evidence={u.geography.evidence} />}
                  </div>
                  {u && u.themes.length > 0 && (
                    <div className="ob-themes">
                      <span className="s-label">Recurring in your posts</span>
                      <ul>
                        {u.themes.map((t) => <li key={t.name}><b>{t.name}</b>, {t.posts} posts, e.g. &ldquo;{t.example}&rdquo;</li>)}
                      </ul>
                    </div>
                  )}
                  {u && u.limitations.length > 0 && <p className="gp-note">{u.limitations.join(" ")}</p>}
                  {connected.length > 0 && (
                    <button type="button" className="ob-link" onClick={readAccounts}>Read my accounts again</button>
                  )}
                </div>
                {nav()}
              </>
            )}

            {step === "goal" && (
              <>
                <div className="ob-head">
                  <h1 ref={headRef} tabIndex={-1}>What are we working toward?</h1>
                  <p>Tell SOCIA what success looks like. It builds your strategy around what you pick and measures against it. You can change it later in Settings.</p>
                </div>
                <GoalStep ref={goalRef} tableReady={initial.tableReady} connectedPlatforms={connectedPlatforms} today={today} onChosen={setGoalCount}
                  initial={{ main: g0.main_goal, others: g0.other_goals }} suggested={u?.suggested_goal ?? null} />
                <AnimatedChoice autoScan />
                {nav("Build my strategy")}
              </>
            )}

            {step === "strategy" && (
              <>
                <StrategyStep onReady={setStrategyReady} headRef={headRef} />
                {err && <div className="ob-err" role="alert">{err}</div>}
                <div className="ob-actions">
                  <button className="ob-btn ob-btn-ghost" onClick={() => go("goal", false)} disabled={saving}>
                    <ArrowLeft size={17} /> Back
                  </button>
                  <button className="ob-btn ob-btn-primary" onClick={() => go("plan", false)} disabled={saving || !strategyReady}>
                    Put my strategy into action <ArrowRight size={17} />
                  </button>
                </div>
                <p className="ob-note">
                  Your first weekly plan is being written from this strategy; the bell tells you when it&apos;s ready. Add your audience, voice and what you can produce any time in <Link href="/settings#growth">Settings</Link>.
                </p>
              </>
            )}

            {step === "plan" && (
              <>
                <PlanStep headRef={headRef} onFree={finish} busy={saving} notice={planNotice} />
                {err && <div className="ob-err" role="alert">{err}</div>}
                <div className="ob-actions">
                  <button className="ob-btn ob-btn-ghost" onClick={() => go("strategy", false)} disabled={saving}>
                    <ArrowLeft size={17} /> Back
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

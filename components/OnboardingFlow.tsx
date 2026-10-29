"use client";

// Setting up a brand: connect, then the Growth Profile one question group at
// a time, then the work that really runs and the first briefing. Every step
// saves where its answers belong (brand_detail through /api/profile, goals
// through /api/goals) and records the step (/api/onboarding), so leaving and
// coming back resumes here. Required for a brand's owner (lib/onboarding.ts).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Loader2, Minus } from "lucide-react";
import { NICHES } from "@/lib/niches";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import { STEPS, STEP_LABEL, nextStep, prevStep, type Step } from "@/lib/onboarding";
import type { Goal, GoalPlatform, GrowthProfile } from "@/lib/growth";
import type { Briefing, StepOutcome } from "@/lib/briefing";
import type { BrandDetail } from "@/lib/profile";
import { Field, Input } from "@/components/system";
import PlanNotice from "@/components/PlanNotice";
import { VOICES } from "@/components/BrandSettings";
import { FREQUENCIES } from "@/components/StrategistSettings";
import { AccountTypeFields, AudienceFields, Choices, PersonalityFields, ResourcesFields, TypeDetailFields } from "./growth/GrowthFields";
import GoalsEditor from "./growth/GoalsEditor";
import ConnectAccounts, { type ConnectState } from "./ConnectAccounts";
import BrandMark from "./BrandMark";

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
  igRead: boolean;
  niche: string | null;
  brandName: string | null;
  detail: BrandDetail | null;
  goals: Goal[];
};

export default function OnboardingFlow({
  connections,
  igUsername = null,
  igStatus = "",
  returned = [],
  initial,
  brands = [],
}: {
  /** The brands this person can open; a switcher shows when there are several. */
  brands?: { id: string; name: string; active: boolean }[];
  /** Real connection state per platform, read on the server. */
  connections: ConnectState[];
  igUsername?: string | null;
  igStatus?: string;
  /** Return codes from the platform callbacks, e.g. { name: "YouTube", code: "denied" }. */
  returned?: { name: string; code: string }[];
  initial: Initial;
}) {
  const router = useRouter();
  const connected = connections.filter((c) => c.connectedAs).map((c) => c.id);
  const connectedPlatforms = connected.map((id) => PLATFORM_ID[id]).filter(Boolean);
  const liveIg = Boolean(igUsername) || igStatus === "connected";

  const [step, setStep] = useState<Step>(initial.step);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const [igRead, setIgRead] = useState(initial.igRead);

  const d = initial.detail ?? {};
  const [growth, setGrowth] = useState<GrowthProfile>(d.growth ?? {});
  const [niche, setNiche] = useState(initial.niche ?? "");
  const [brandName, setBrandName] = useState(initial.brandName ?? "");
  const [location, setLocation] = useState(d.location ?? "");
  const [website, setWebsite] = useState(d.website ?? "");
  const [voice, setVoice] = useState(d.voice ?? "");
  const [avoid, setAvoid] = useState(d.avoid ?? "");
  const [frequency, setFrequency] = useState(d.strategist?.frequency ?? "");
  const [goals, setGoals] = useState<Goal[]>(initial.goals);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [init, setInit] = useState<{ outcomes: StepOutcome[]; briefing: Briefing } | null>(null);
  const [initErr, setInitErr] = useState<string | null>(null);
  const initStarted = useRef(false);
  const headRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the new step's heading, so keyboard and screen-reader users land on it.
  useEffect(() => {
    headRef.current?.focus();
  }, [step]);

  const post = (url: string, body: unknown) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  /** What each step saves, in the places the rest of SOCIA already reads. */
  function payloadFor(s: Step): Record<string, unknown> | null {
    switch (s) {
      case "account":
        return { brand_detail: { growth: { account_type: growth.account_type } } };
      case "identity":
        return {
          niche,
          brand_name: brandName,
          platforms: connected,
          ...(liveIg ? { account_connected: true } : {}),
          brand_detail: {
            location: location.trim() || undefined,
            website: website.trim() || undefined,
            growth: { focus: growth.focus ?? "", ...(growth.business ? { business: growth.business } : {}), ...(growth.creator ? { creator: growth.creator } : {}) },
          },
        };
      case "audience":
        return { brand_detail: { growth: { audience: growth.audience ?? {} } } };
      case "voice":
        return { brand_detail: { voice: voice || undefined, avoid: avoid.trim() || undefined, growth: { personality: growth.personality ?? {} } } };
      case "resources":
        return { brand_detail: { strategist: frequency ? { frequency } : {}, growth: { resources: growth.resources ?? {} } } };
      default:
        return null;
    }
  }

  async function go(to: Step, save: boolean) {
    setErr(null);
    if (save) {
      const body = payloadFor(step);
      if (body) {
        setSaving(true);
        const r = await post("/api/profile", body).catch(() => null);
        setSaving(false);
        if (!r?.ok) {
          const j = await r?.json().catch(() => null);
          setErr(j?.error || "Couldn't save this step. Try again.");
          return;
        }
      }
    }
    // Progress is bookkeeping: if it can't be saved, the answers above still were.
    void post("/api/onboarding", { step: to }).catch(() => null);
    setStep(to);
  }

  // Leaving Connect with Instagram live and no read yet: read the account for
  // a suggested niche (the real request, shown for as long as it takes).
  async function fromConnect() {
    if (!liveIg || igRead || niche) return go("account", false);
    setReading(true);
    try {
      const r = await fetch("/api/analyze-account");
      const j = await r.json().catch(() => null);
      if (!r.ok && isPlanError(j)) setPlanError(j);
      const x = j?.extracted;
      if (x) {
        if (x.niche && NICHES.includes(x.niche)) setNiche(x.niche);
        if (x.brand_name && !brandName) setBrandName(x.brand_name);
        if (x.sub_niche && !growth.focus) setGrowth((g) => ({ ...g, focus: String(x.sub_niche).slice(0, 120) }));
        setReadNote("Suggested from your recent Instagram posts. Change anything that's wrong.");
      } else if (r.ok) {
        setReadNote("SOCIA couldn't read your Instagram posts just now, so fill these in yourself.");
      }
      setIgRead(true);
      void post("/api/onboarding", { step: "account", mark: { ig_read: true } }).catch(() => null);
    } catch {
      setReadNote("SOCIA couldn't read your Instagram posts just now, so fill these in yourself.");
    } finally {
      setReading(false);
    }
    setStep("account");
  }

  // The briefing step runs the real initialization once.
  useEffect(() => {
    if (step !== "briefing" || initStarted.current) return;
    initStarted.current = true;
    post("/api/onboarding/initialize", {})
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.briefing) throw new Error(j?.error || "Couldn't read your accounts just now. Try again in a minute.");
        setInit(j);
      })
      .catch((e) => setInitErr(e instanceof Error ? e.message : "Couldn't read your accounts just now."));
  }, [step]);

  async function finish() {
    setSaving(true);
    setErr(null);
    const r = await post("/api/onboarding", { step: "briefing", completed: true }).catch(() => null);
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
  const canNext =
    step === "account" ? Boolean(growth.account_type) : step === "identity" ? Boolean(niche) : true;

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
          <div className="ob-stage ob-reading" role="status" aria-live="polite">
            <Loader2 size={22} className="spin" aria-hidden />
            <h1>Reading {igUsername ? <>@{igUsername}</> : "your Instagram"}</h1>
            <p>SOCIA is reading your profile and recent posts to suggest your niche.</p>
          </div>
        ) : (
          <div className="ob-stage" key={step}>
            {step === "connect" && (
              <>
                <div className="ob-head">
                  <h1 ref={headRef} tabIndex={-1}>Connect your accounts</h1>
                  <p>
                    SOCIA reads your posts and numbers from each account you connect. With Instagram
                    connected it also suggests your niche. You can connect more later from Settings.
                  </p>
                </div>
                {igStatus && igStatus !== "connected" && RETURN_ERRORS[igStatus] && <div className="ob-err">Instagram {RETURN_ERRORS[igStatus]}</div>}
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
                  <button className="ob-btn ob-btn-primary" onClick={fromConnect}>
                    {connected.length ? "Continue" : "Continue without connecting"} <ArrowRight size={17} />
                  </button>
                </div>
              </>
            )}

            {step === "account" && (
              <>
                <div className="ob-head">
                  <h1 ref={headRef} tabIndex={-1}>What kind of account is this?</h1>
                  <p>This decides which questions come next and how SOCIA plans for you.</p>
                </div>
                {planError && <PlanNotice error={planError} compact />}
                <div className="ob-fields">
                  <AccountTypeFields value={growth} onChange={setGrowth} />
                </div>
                {nav()}
              </>
            )}

            {step === "identity" && (
              <>
                <div className="ob-head">
                  <h1 ref={headRef} tabIndex={-1}>What is the account about?</h1>
                  {readNote && <p>{readNote}</p>}
                </div>
                <div className="ob-fields">
                  <Field label="Niche">
                    <select className="s-input" value={niche} onChange={(e) => setNiche(e.target.value)}>
                      <option value="" disabled>Choose a category…</option>
                      {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </Field>
                  <Field label="In a line, what do you post about?" optional>
                    <Input maxLength={120} value={growth.focus ?? ""} placeholder="e.g. Wood-fired pizza and the family behind it" onChange={(e) => setGrowth({ ...growth, focus: e.target.value })} />
                  </Field>
                  <Field label="Account or brand name" optional>
                    <Input maxLength={80} value={brandName} placeholder="@yourhandle or your business name" onChange={(e) => setBrandName(e.target.value)} />
                  </Field>
                  <TypeDetailFields value={growth} onChange={setGrowth} />
                  <div className="gp-row">
                    <Field label="Location" optional>
                      <Input maxLength={120} value={location} placeholder="e.g. Hermitage, TN" onChange={(e) => setLocation(e.target.value)} />
                    </Field>
                    <Field label="Website" optional>
                      <Input maxLength={200} value={website} placeholder="example.com" onChange={(e) => setWebsite(e.target.value)} />
                    </Field>
                  </div>
                </div>
                {nav()}
              </>
            )}

            {step === "audience" && (
              <>
                <div className="ob-head">
                  <h1 ref={headRef} tabIndex={-1}>Who is it for?</h1>
                  <p>SOCIA writes plans and captions for these people.</p>
                </div>
                <div className="ob-fields">
                  <AudienceFields value={growth} onChange={setGrowth} />
                </div>
                {nav()}
              </>
            )}

            {step === "goals" && (
              <>
                <div className="ob-head">
                  <h1 ref={headRef} tabIndex={-1}>What are you working toward?</h1>
                  <p>Set a goal SOCIA can measure, with a target and a date. You can add more, or change them, in Settings.</p>
                </div>
                <div className="ob-fields">
                  <GoalsEditor initial={goals} tableReady={initial.tableReady} connected={connectedPlatforms} onChange={setGoals} />
                </div>
                {nav(goals.length ? "Continue" : "Skip for now")}
              </>
            )}

            {step === "voice" && (
              <>
                <div className="ob-head">
                  <h1 ref={headRef} tabIndex={-1}>How do you sound?</h1>
                  <p>Plans, captions and replies follow this.</p>
                </div>
                <div className="ob-fields">
                  <Choices label="Voice" options={VOICES.map((v) => ({ id: v, label: v }))} columns={3} value={voice} onChange={(v) => setVoice(String(v))} />
                  <PersonalityFields value={growth} onChange={setGrowth} />
                  <Field label="Words or topics to avoid" optional>
                    <Input maxLength={300} value={avoid} placeholder="e.g. discounts, politics" onChange={(e) => setAvoid(e.target.value)} />
                  </Field>
                </div>
                {nav()}
              </>
            )}

            {step === "resources" && (
              <>
                <div className="ob-head">
                  <h1 ref={headRef} tabIndex={-1}>What can you make?</h1>
                  <p>SOCIA keeps plans to what you have time and tools for.</p>
                </div>
                <div className="ob-fields">
                  <ResourcesFields value={growth} onChange={setGrowth} />
                  <Choices label="How often do you want to post?" options={FREQUENCIES.map((f) => ({ id: f, label: f }))} columns={4} value={frequency} onChange={(v) => setFrequency(String(v))} />
                </div>
                {nav("Finish setup")}
              </>
            )}

            {step === "briefing" && (
              <>
                <div className="ob-head">
                  <h1 ref={headRef} tabIndex={-1}>Your first briefing</h1>
                  <p>What SOCIA did with your accounts just now, and where to start.</p>
                </div>

                {!init && !initErr && (
                  <div className="ob-reading" role="status" aria-live="polite">
                    <Loader2 size={22} className="spin" aria-hidden />
                    <p>Reading your connected accounts and recording where your goals start.</p>
                  </div>
                )}
                {initErr && <div className="ob-err" role="alert">{initErr}</div>}

                {init && (
                  <div className="ob-brief">
                    {init.outcomes.length > 0 && (
                      <section>
                        <h2>What ran</h2>
                        <ul className="ob-outcomes">
                          {init.outcomes.map((o, k) => (
                            <li key={k} className={o.status}>
                              {o.status === "done" ? <Check size={15} aria-hidden /> : <Minus size={15} aria-hidden />}
                              <span><b>{o.label}</b> {o.detail}</span>
                              <small>{o.status === "done" ? "Done" : o.status === "unavailable" ? "Not available" : "Failed"}</small>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                    {init.briefing.learned.length > 0 && (
                      <section>
                        <h2>From your accounts</h2>
                        <ul>{init.briefing.learned.map((l, k) => <li key={k}>{l}</li>)}</ul>
                      </section>
                    )}
                    {init.briefing.missing.length > 0 && (
                      <section>
                        <h2>Not available yet</h2>
                        <ul>{init.briefing.missing.map((l, k) => <li key={k}>{l}</li>)}</ul>
                      </section>
                    )}
                    <section>
                      <h2>Start here</h2>
                      <ol className="ob-next">
                        {init.briefing.actions.map((a) => (
                          <li key={a.label}>
                            <Link href={a.href}>{a.label}</Link>
                            <small>{a.why}</small>
                          </li>
                        ))}
                      </ol>
                    </section>
                    {init.briefing.guidance.length > 0 && (
                      <section className="ob-guidance">
                        <h2>Starting guidance</h2>
                        <p className="gp-note">General advice for your goal and situation, not a finding from your data.</p>
                        <ul>{init.briefing.guidance.map((l, k) => <li key={k}>{l}</li>)}</ul>
                      </section>
                    )}
                  </div>
                )}

                {err && <div className="ob-err" role="alert">{err}</div>}
                <div className="ob-actions">
                  <button className="ob-btn ob-btn-ghost" onClick={() => go("resources", false)} disabled={saving}>
                    <ArrowLeft size={17} /> Back
                  </button>
                  <button className="ob-btn ob-btn-primary" onClick={finish} disabled={saving || (!init && !initErr)}>
                    {saving ? "Opening…" : "Open SOCIA"} {!saving && <ArrowRight size={17} />}
                  </button>
                </div>
                <p className="ob-note">You&apos;re on the Free plan. <Link href="/pricing">Compare plans</Link></p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

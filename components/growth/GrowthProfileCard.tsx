"use client";

// Settings: the Growth Profile answered in onboarding, editable any time,
// including the account type. Profile sections save together; goals save
// as they change.

import { useRef, useState } from "react";
import { Button } from "@/components/system";
import { GOAL_PLATFORM_NAME, mainGoalsFor, type Goal, type GoalPlatform, type GrowthProfile, type MainGoalId } from "@/lib/growth";
import { confidenceLabel, type Understanding } from "@/lib/intel/understanding";
import { AccountTypeFields, AudienceFields, Choices, GrowthGroup, PersonalityFields, ResourcesFields, TypeDetailFields } from "./GrowthFields";
import GoalsEditor from "./GoalsEditor";
import RoutineStep from "@/components/onboarding/RoutineStep";
import { FIRST_QUESTIONS, LATER_QUESTIONS, routineSummary } from "@/lib/routine";
import { Field, Input, Switch } from "@/components/system";

export default function GrowthProfileCard({
  initial,
  goals,
  goalsReady,
  connected,
}: {
  initial: GrowthProfile;
  goals: Goal[];
  goalsReady: boolean;
  connected: GoalPlatform[];
}) {
  // The understanding is SOCIA's own record; it is shown, never sent back in a save.
  const { understanding: initialUnderstanding, ...editable } = initial;
  const [growth, setGrowth] = useState<GrowthProfile>(editable);
  const [saved, setSaved] = useState(JSON.stringify(editable));
  const [understanding, setUnderstanding] = useState<Understanding | null>(initialUnderstanding ?? null);
  const [reading, setReading] = useState(false);
  const [readMsg, setReadMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(growth) !== saved;
  const [routineOpen, setRoutineOpen] = useState(false);
  const routineHead = useRef<HTMLHeadingElement>(null);
  // SIO's cards on the Dashboard, on or off for this brand. Saved at once, like each routine answer.
  const [sioSaving, setSioSaving] = useState(false);
  const [sioError, setSioError] = useState<string | null>(null);
  async function setSioSpeaks(on: boolean) {
    setSioSaving(true); setSioError(null);
    const res = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_detail: { growth: { routine: { quiet: !on } } } }) }).catch(() => null);
    setSioSaving(false);
    if (!res?.ok) { setSioError("That didn't save. Check your connection and try again."); return; }
    // This device may have its own "don't ask again" from before the switch existed: clear it when SIO is turned back on.
    if (on) { try { for (const k of Object.keys(window.localStorage)) if (k.startsWith("sio-routine-off:") || k.startsWith("sio-checkin-off:")) window.localStorage.removeItem(k); } catch { /* storage unavailable */ } }
    const r = { ...(growth.routine ?? {}), quiet: !on };
    setGrowth((g) => ({ ...g, routine: r }));
    setSaved((prev) => { try { return JSON.stringify({ ...JSON.parse(prev), routine: r }); } catch { return prev; } });
  }

  async function readAgain() {
    setReading(true);
    setReadMsg(null);
    try {
      const r = await fetch("/api/understand", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || j.message || "SOCIA couldn't read your accounts just now.");
      if (j.status === "no_accounts") setReadMsg("No account is connected in this brand yet.");
      if (j.understanding) setUnderstanding(j.understanding);
    } catch (e) {
      setReadMsg(e instanceof Error ? e.message : "SOCIA couldn't read your accounts just now.");
    } finally {
      setReading(false);
    }
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_detail: { growth } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.brandSaved === false) throw new Error(j.error || "Couldn't save your profile. Try again.");
      setSaved(JSON.stringify(growth));
      setMsg({ ok: true, text: "Saved." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save your profile. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gp-card">
      <GrowthGroup title="Goals">
        <GoalsEditor initial={goals} tableReady={goalsReady} connected={connected} />
      </GrowthGroup>
      <GrowthGroup title="Your routine">
        {routineOpen ? (
          <RoutineStep corner initial={growth.routine ?? null} recentPerWeek={null} headRef={routineHead} questions={[...FIRST_QUESTIONS, ...LATER_QUESTIONS]} lastLabel="Done" startAtEnd={false}
            fromStart
            onSaved={(r) => {
              // Each answer is already saved; keep it out of the card's own unsaved changes.
              setGrowth((g) => ({ ...g, routine: r }));
              setSaved((prev) => { try { return JSON.stringify({ ...JSON.parse(prev), routine: r }); } catch { return prev; } });
            }}
            onBack={() => setRoutineOpen(false)} onDone={() => setRoutineOpen(false)} />
        ) : (
          <>
            {routineSummary(growth.routine).length > 0 ? (
              <dl className="gp-routine">
                {routineSummary(growth.routine).map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
              </dl>
            ) : (
              <p className="gp-note">SIO hasn&apos;t asked about your week yet: how often you want to post, what you make, and when you film.</p>
            )}
            <div><Button size="sm" variant="secondary" onClick={() => setRoutineOpen(true)}>{routineSummary(growth.routine).length ? "Change" : "Answer SIO's questions"}</Button></div>
            <div className="gp-sio-switch">
              <span>
                <b id="gp-sio-switch">SIO speaks first on the Dashboard</b>
                <small>Its questions about your week and the weekly check-in. Off, SIO stays quiet until you open Ask SOCIA. This applies on every device.</small>
              </span>
              <Switch label="SIO speaks first on the Dashboard" checked={!growth.routine?.quiet} disabled={sioSaving} onCheckedChange={(on) => void setSioSpeaks(on)} />
            </div>
            {sioError && <p className="gp-note" role="alert">{sioError}</p>}
          </>
        )}
      </GrowthGroup>
      <GrowthGroup title="Main goal">
        <Choices label="What matters most right now" options={mainGoalsFor(growth.customer_goal)} columns={3} value={growth.main_goal} onChange={(v) => setGrowth({ ...growth, main_goal: v as MainGoalId })} />
      </GrowthGroup>
      <GrowthGroup title="What SOCIA read from your accounts">
        {understanding ? (
          <>
            <p className="gp-note">
              Read {new Date(understanding.analyzed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} from{" "}
              {understanding.facts.map((f) => `${GOAL_PLATFORM_NAME[f.platform]} (${f.postsSampled} posts)`).join(", ") || "no posts"}.
              Your answers on this page always win over these.
            </p>
            <ul className="gp-read">
              {understanding.account_type && <li><b>Account type</b> {understanding.account_type.value.replace("_", " ")}, <i>{confidenceLabel(understanding.account_type.confidence)}</i></li>}
              {understanding.niche && <li><b>Niche</b> {[understanding.niche.value.category, understanding.niche.value.subcategory, understanding.niche.value.specific].filter(Boolean).join(" > ")}, <i>{confidenceLabel(understanding.niche.confidence)}</i></li>}
              {understanding.audience && <li><b>Audience</b> {understanding.audience.value}, <i>{confidenceLabel(understanding.audience.confidence)}</i></li>}
              {understanding.geography?.value.place && <li><b>Location</b> {understanding.geography.value.place}, <i>{confidenceLabel(understanding.geography.confidence)}</i></li>}
              {understanding.themes.length > 0 && <li><b>Recurring themes</b> {understanding.themes.map((t) => `${t.name} (${t.posts})`).join(", ")}</li>}
            </ul>
            {understanding.limitations.length > 0 && <p className="gp-note">{understanding.limitations.join(" ")}</p>}
          </>
        ) : (
          <p className="gp-note">SOCIA hasn&apos;t read this brand&apos;s accounts yet.</p>
        )}
        <div className="gp-save">
          <Button onClick={readAgain} busy={reading}>{understanding ? "Read my accounts again" : "Read my accounts"}</Button>
          {readMsg && <span className="s-error" role="alert">{readMsg}</span>}
        </div>
        <p className="gp-note">Uses one account audit from your plan.</p>
      </GrowthGroup>
      <GrowthGroup title="Account">
        <AccountTypeFields value={growth} onChange={setGrowth} />
        <div className="gp-row">
          <Field label="Niche, more specifically" optional>
            <Input maxLength={60} value={growth.niche_path?.subcategory ?? ""} placeholder="e.g. Pizza" onChange={(e) => setGrowth({ ...growth, niche_path: { ...growth.niche_path, subcategory: e.target.value } })} />
          </Field>
          <Field label="Narrower still" optional>
            <Input maxLength={80} value={growth.niche_path?.specific ?? ""} placeholder="e.g. Neighbourhood pizzeria" onChange={(e) => setGrowth({ ...growth, niche_path: { ...growth.niche_path, specific: e.target.value } })} />
          </Field>
        </div>
        <Field label="In a line, what do you post about?" optional>
          <Input maxLength={120} value={growth.focus ?? ""} onChange={(e) => setGrowth({ ...growth, focus: e.target.value })} />
        </Field>
        <TypeDetailFields value={growth} onChange={setGrowth} />
      </GrowthGroup>
      <GrowthGroup title="Audience">
        <AudienceFields value={growth} onChange={setGrowth} />
      </GrowthGroup>
      <GrowthGroup title="Personality">
        <PersonalityFields value={growth} onChange={setGrowth} />
      </GrowthGroup>
      <GrowthGroup title="Resources">
        <ResourcesFields value={growth} onChange={setGrowth} />
      </GrowthGroup>
      <div className="gp-save">
        <Button variant="primary" onClick={save} busy={busy} disabled={!dirty}>
          Save profile
        </Button>
        {msg && <span className={msg.ok ? "gp-note" : "s-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</span>}
      </div>
    </div>
  );
}

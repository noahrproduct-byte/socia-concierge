"use client";

// Settings: the Growth Profile answered in onboarding, editable any time,
// including the account type. Profile sections save together; goals save
// as they change.

import { useState } from "react";
import { Button } from "@/components/system";
import type { Goal, GoalPlatform, GrowthProfile } from "@/lib/growth";
import { AccountTypeFields, AudienceFields, GrowthGroup, PersonalityFields, ResourcesFields, TypeDetailFields } from "./GrowthFields";
import GoalsEditor from "./GoalsEditor";
import { Field, Input } from "@/components/system";

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
  const [growth, setGrowth] = useState<GrowthProfile>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(growth) !== saved;

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
      <GrowthGroup title="Account">
        <AccountTypeFields value={growth} onChange={setGrowth} />
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

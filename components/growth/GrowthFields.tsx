"use client";

// The Growth Profile's questions, as controlled fragments. Onboarding shows
// one group per step; Settings shows them all, so anything answered once can
// be changed later. Values are lib/growth.ts shapes; nothing here saves.

import type { ReactNode } from "react";
import { Field, Input, Textarea } from "@/components/system";
import {
  ACCOUNT_TYPES, CUSTOMER_ACTIONS, EDITING, EQUIPMENT, HOURS, MAKERS, MONETIZATION, ON_CAMERA, REACH_SCOPES,
  usesBusinessBlock, type GrowthProfile,
} from "@/lib/growth";
import "./growth.css";

type Opt = { id: string; label: string; hint?: string };

/** A set of choices shown as buttons: one (radio) or several (checkbox) selected. */
export function Choices({
  label,
  options,
  value,
  onChange,
  multi = false,
  columns = 2,
}: {
  label: string;
  options: readonly Opt[];
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  multi?: boolean;
  columns?: 2 | 3 | 4;
}) {
  const picked = (id: string) => (Array.isArray(value) ? value.includes(id) : value === id);
  const toggle = (id: string) => {
    if (!multi) return onChange(id);
    const cur = Array.isArray(value) ? value : [];
    onChange(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };
  return (
    <fieldset className="gp-choices">
      <legend className="s-label">{label}</legend>
      <div className={`gp-choice-grid cols-${columns}`} role={multi ? "group" : "radiogroup"}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role={multi ? "checkbox" : "radio"}
            aria-checked={picked(o.id)}
            className={`gp-choice${picked(o.id) ? " on" : ""}`}
            onClick={() => toggle(o.id)}
          >
            <b>{o.label}</b>
            {o.hint && <small>{o.hint}</small>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

type Props = { value: GrowthProfile; onChange: (v: GrowthProfile) => void };
const set = <K extends keyof GrowthProfile>(v: GrowthProfile, k: K, patch: Partial<NonNullable<GrowthProfile[K]>>): GrowthProfile => ({
  ...v,
  [k]: { ...((v[k] as object | undefined) ?? {}), ...patch },
});

export function AccountTypeFields({ value, onChange }: Props) {
  return (
    <Choices
      label="Account type"
      options={ACCOUNT_TYPES}
      value={value.account_type}
      onChange={(id) => onChange({ ...value, account_type: id as GrowthProfile["account_type"] })}
    />
  );
}

/** Business or creator detail, whichever the account type calls for. */
export function TypeDetailFields({ value, onChange }: Props) {
  if (!value.account_type) return null;
  if (usesBusinessBlock(value.account_type)) {
    const b = value.business ?? {};
    return (
      <>
        <Field label="What do you sell or offer?" optional>
          <Input value={b.offer ?? ""} maxLength={300} placeholder="e.g. Wood-fired pizza, catering for events" onChange={(e) => onChange(set(value, "business", { offer: e.target.value }))} />
        </Field>
        <Choices label="What should a customer do after seeing a post?" options={CUSTOMER_ACTIONS} columns={3} value={b.customer_action} onChange={(id) => onChange(set(value, "business", { customer_action: id as never }))} />
        <Choices label="Where do your customers come from?" options={REACH_SCOPES} columns={4} value={b.service_area} onChange={(id) => onChange(set(value, "business", { service_area: id as never }))} />
      </>
    );
  }
  const c = value.creator ?? {};
  return (
    <>
      <Field label="What topics do you cover?" optional>
        <Input value={c.topics ?? ""} maxLength={300} placeholder="e.g. Home workouts, meal prep, running" onChange={(e) => onChange(set(value, "creator", { topics: e.target.value }))} />
      </Field>
      <Choices label="How do you earn from it, if at all?" options={MONETIZATION} multi columns={3} value={c.monetization} onChange={(ids) => onChange(set(value, "creator", { monetization: ids as never }))} />
    </>
  );
}

export function AudienceFields({ value, onChange }: Props) {
  const a = value.audience ?? {};
  return (
    <>
      <Field label="Who are you trying to reach?" hint="In your words: who they are, not age brackets.">
        <Textarea rows={2} maxLength={300} value={a.who ?? ""} placeholder="e.g. Families within a short drive who want a weekend treat" onChange={(e) => onChange(set(value, "audience", { who: e.target.value }))} />
      </Field>
      <Choices label="Where are they?" options={REACH_SCOPES} columns={4} value={a.where} onChange={(id) => onChange(set(value, "audience", { where: id as never }))} />
      <Field label="What do they want from you?" optional>
        <Input value={a.wants ?? ""} maxLength={300} placeholder="e.g. To know what's new this week and when to come in" onChange={(e) => onChange(set(value, "audience", { wants: e.target.value }))} />
      </Field>
    </>
  );
}

export function PersonalityFields({ value, onChange }: Props) {
  const p = value.personality ?? {};
  return (
    <>
      <Choices label="Are you comfortable on camera?" options={ON_CAMERA} columns={3} value={p.on_camera} onChange={(id) => onChange(set(value, "personality", { on_camera: id as never }))} />
      <Field label="What content do you enjoy making?" optional>
        <Input value={p.enjoys ?? ""} maxLength={300} placeholder="e.g. Behind the scenes, quick tips, answering questions" onChange={(e) => onChange(set(value, "personality", { enjoys: e.target.value }))} />
      </Field>
    </>
  );
}

export function ResourcesFields({ value, onChange }: Props) {
  const r = value.resources ?? {};
  return (
    <>
      <Choices label="Time for content each week" options={HOURS} columns={4} value={r.hours_per_week} onChange={(id) => onChange(set(value, "resources", { hours_per_week: id as never }))} />
      <Choices label="What do you film with?" options={EQUIPMENT} multi columns={4} value={r.equipment} onChange={(ids) => onChange(set(value, "resources", { equipment: ids as never }))} />
      <Choices label="Editing" options={EDITING} columns={3} value={r.editing} onChange={(id) => onChange(set(value, "resources", { editing: id as never }))} />
      <Choices label="Who makes the content?" options={MAKERS} value={r.makers} onChange={(id) => onChange(set(value, "resources", { makers: id as never }))} />
    </>
  );
}

/** A titled group of fields, for Settings. */
export function GrowthGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="gp-group">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

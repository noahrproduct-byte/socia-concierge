"use client";

// How many posts this week's plan has, and of which kind (lib/planMix.ts).
// Noah, 2026-11-14: an account built on animated videos is asked how many
// posts it wants and whether to add on-camera videos; every other account is
// asked how many of each. The numbers start from the last plan's mix, so a
// new plan follows the account's own way of posting until it is changed.
import { useId } from "react";
import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import { IconButton, Switch } from "@/components/system";
import { MIX_MAX, type PlanMix } from "@/lib/planMix";
import { PLANS, minPlanWithMeter, pricingHref } from "@/lib/plans";

export type MixValue = { onCamera: number; animated: number };

function Stepper({ label, hint, value, min, onChange, disabled }: { label: string; hint?: string; value: number; min: number; onChange: (n: number) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="cpl-step">
      <span className="cpl-step-text">
        <b id={id}>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <span className="cpl-step-ctl" role="group" aria-labelledby={id}>
        <IconButton label={`Fewer ${label.toLowerCase()}`} size="sm" variant="secondary" disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
          <Minus size={14} aria-hidden />
        </IconButton>
        <output className="cpl-step-n" aria-live="polite">{value}</output>
        <IconButton label={`More ${label.toLowerCase()}`} size="sm" variant="secondary" disabled={disabled || value >= MIX_MAX} onClick={() => onChange(value + 1)}>
          <Plus size={14} aria-hidden />
        </IconButton>
      </span>
    </div>
  );
}

const FROM_NOTE: Record<PlanMix["from"], string | null> = {
  last_plan: "Same mix as your last plan. Change it for this week only.",
  settings: "From your animated video setting.",
  default: null,
};

export default function PlanMixControls({ start, animatedAllowed, value, onChange, addOnCamera, onAddOnCamera }: {
  start: PlanMix;
  animatedAllowed: boolean;
  value: MixValue;
  onChange: (v: MixValue) => void;
  /** Animated-led accounts only: whether this week also has on-camera videos. */
  addOnCamera: boolean;
  onAddOnCamera: (on: boolean) => void;
}) {
  const total = value.onCamera + value.animated;
  const note = FROM_NOTE[start.from];
  const animatedPlan = minPlanWithMeter("animated_videos", 0);

  if (start.animatedLed && animatedAllowed) {
    return (
      <div className="cpl-mix">
        <Stepper label="Posts this week" hint="Animated videos, like the ones you post now" value={value.animated} min={1} onChange={(n) => onChange({ ...value, animated: n })} />
        <div className="cpl-step">
          <span className="cpl-step-text">
            <b>Add on-camera videos</b>
            <small>Posts you film yourself</small>
          </span>
          <Switch label="Add on-camera videos" checked={addOnCamera} onCheckedChange={onAddOnCamera} />
        </div>
        {addOnCamera && <Stepper label="On-camera videos" value={value.onCamera} min={1} onChange={(n) => onChange({ ...value, onCamera: n })} />}
        {note && <small className="cpl-mix-note">{note}</small>}
      </div>
    );
  }

  return (
    <div className="cpl-mix">
      <Stepper label="On-camera videos" hint="Posts you film yourself" value={value.onCamera} min={value.animated > 0 ? 0 : 1} onChange={(n) => onChange({ ...value, onCamera: n })} />
      {animatedAllowed ? (
        <Stepper label="Animated videos" hint="SOCIA makes these, no filming" value={value.animated} min={value.onCamera > 0 ? 0 : 1} onChange={(n) => onChange({ ...value, animated: n })} />
      ) : (
        animatedPlan && (
          <small className="cpl-mix-note">
            Animated videos come with <Link href={pricingHref(animatedPlan)}>{PLANS[animatedPlan].name}</Link>.
          </small>
        )
      )}
      <small className="cpl-mix-note">
        {total} {total === 1 ? "post" : "posts"} this week.{note ? ` ${note}` : ""}
      </small>
    </div>
  );
}

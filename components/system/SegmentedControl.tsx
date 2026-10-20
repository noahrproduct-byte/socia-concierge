"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = { value: T; label: ReactNode; disabled?: boolean };

type Props<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** The accessible name of the group ("Metric", "Period"). */
  label: string;
  /** `tablist` when the options switch panels (pass `panelId`), `radiogroup` when they set a value. */
  role?: "tablist" | "radiogroup";
  panelId?: (value: T) => string;
  className?: string;
};

/**
 * The one segmented control. Arrow keys move the selection; the role decides
 * the ARIA shape, so one visual never carries two meanings by accident.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, label, role = "radiogroup", panelId, className }: Props<T>) {
  const id = useId();
  const tabs = role === "tablist";

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const enabled = options.filter((o) => !o.disabled);
    const i = enabled.findIndex((o) => o.value === value);
    let next = i;
    if (e.key === "ArrowLeft") next = (i - 1 + enabled.length) % enabled.length;
    if (e.key === "ArrowRight") next = (i + 1) % enabled.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = enabled.length - 1;
    const target = enabled[next];
    if (!target) return;
    onChange(target.value);
    const el = document.getElementById(`${id}-${target.value}`);
    el?.focus();
  };

  return (
    <div className={cn("s-seg", className)} role={role} aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            id={`${id}-${o.value}`}
            type="button"
            role={tabs ? "tab" : "radio"}
            aria-selected={tabs ? on : undefined}
            aria-checked={tabs ? undefined : on}
            aria-controls={tabs && panelId ? panelId(o.value) : undefined}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

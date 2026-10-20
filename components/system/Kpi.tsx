import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

const DASH = String.fromCharCode(0x2014);

/** One container split by hairlines. `cols` matches the number of cells. */
export function KpiStrip({ cols, className, children }: { cols?: number; className?: string; children: ReactNode }) {
  const style = cols ? ({ "--kpi-cols": cols } as CSSProperties) : undefined;
  return (
    <div className={cn("s-kpis", className)} style={style}>
      {children}
    </div>
  );
}

export type KpiDelta = {
  /** Already formatted, with its sign: "+12%", "-3", "+4 (new)". */
  text: string;
  /** Colour says good or bad, never up or down. Omit when the change is zero or undefined. */
  tone?: "good" | "bad";
  /** The window in words: "vs prior 30 days". */
  window?: string;
};

type KpiCellProps = {
  label: string;
  /** Formatted value, or null when it is not available. */
  value: string | null;
  /** A smaller grey suffix: "%", "min". */
  unit?: string;
  /** Why the value is missing. Required whenever value is null. */
  reason?: string;
  delta?: KpiDelta;
  /** One line under the value: the source, the sample, a caveat. */
  note?: string;
  icon?: ReactNode;
  /** When the strip doubles as the chart's series tabs. */
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
};

/**
 * Label over value, 24px at medium weight, the delta in words, and the honest
 * cell when the value is unknown: a grey dash with its reason visible and
 * announced, never a zero.
 */
export function KpiCell({ label, value, unit, reason, delta, note, icon, selected, onSelect, className }: KpiCellProps) {
  const na = value == null;
  const body = (
    <>
      <div className="s-kpi-label">
        {icon}
        {label}
      </div>
      <div className={cn("s-kpi-value", na && "is-na")} aria-label={na ? `${label}: not available. ${reason ?? ""}`.trim() : undefined}>
        {na ? DASH : value}
        {!na && unit && <small>{unit}</small>}
      </div>
      {na ? (
        <div className="s-kpi-note">{reason ?? "Not available"}</div>
      ) : delta ? (
        <div className={cn("s-kpi-delta", delta.tone === "good" && "is-good", delta.tone === "bad" && "is-bad")}>
          <b>{delta.text}</b>
          {delta.window ? ` ${delta.window}` : null}
        </div>
      ) : null}
      {note && <div className="s-kpi-note">{note}</div>}
    </>
  );
  if (onSelect) {
    return (
      <button type="button" className={cn("s-kpi", selected && "is-selected", className)} aria-pressed={selected} onClick={onSelect}>
        {body}
      </button>
    );
  }
  return <div className={cn("s-kpi", className)}>{body}</div>;
}

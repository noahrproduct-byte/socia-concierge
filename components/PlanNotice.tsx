import Link from "next/link";
import { formatResetDate, type PlanError } from "@/lib/planErrors";
import { METER_LABEL, METER_UNIT, type MeterKey } from "@/lib/plans";

// The contextual upgrade moment. One component, used wherever a plan limit is
// hit, so every limit reads the same way: the sentence, then one CTA. Quiet by
// design; it is not a banner and it never stacks.
//
// No hooks, so it renders from server and client components alike.

export default function PlanNotice({
  error,
  compact = false,
  onCta,
}: {
  error: PlanError;
  compact?: boolean;
  /** Optional: fire a product event before navigating (client components only). */
  onCta?: () => void;
}) {
  const soon = error.code === "coming_soon";
  return (
    <div className={`pn${compact ? " compact" : ""}${soon ? " soon" : ""}`} role="status">
      <div className="pn-body">
        <p>{error.error}</p>
        {error.resetsOn && error.code === "usage_exhausted" && (
          <small>Resets on {formatResetDate(error.resetsOn)}.</small>
        )}
      </div>
      <Link href={error.href} className="pn-cta" onClick={onCta}>
        {error.cta}
      </Link>
    </div>
  );
}

/**
 * "37 / 50 used" for a meter. Hidden until the person is near the limit
 * (80% by default) unless `always` is set, so ordinary use never feels metered.
 * `used === null` means the counter could not be read; nothing is invented.
 */
export function UsageLine({
  meter,
  used,
  limit,
  resetsOn,
  always = false,
  threshold = 0.8,
  className,
}: {
  meter: MeterKey;
  used: number | null;
  limit: number;
  /** ISO reset date; when present, shown once the line is near the limit. */
  resetsOn?: string | null;
  always?: boolean;
  threshold?: number;
  className?: string;
}) {
  if (used == null || limit <= 0) return null;
  const near = used >= Math.ceil(limit * threshold);
  if (!always && !near) return null;
  const left = Math.max(0, limit - used);
  const unit = left === 1 ? METER_UNIT[meter].one : METER_UNIT[meter].many;
  // The reset date matters most once someone is close to or out of allowance.
  const showReset = resetsOn && (near || left === 0);
  return (
    <span className={`usage-line${near ? " near" : ""}${left === 0 ? " out" : ""}${className ? ` ${className}` : ""}`}>
      {METER_LABEL[meter]}: {used} / {limit} used
      {left > 0 ? ` · ${left} ${unit} left` : ""}
      {showReset ? ` · resets ${formatResetDate(resetsOn)}` : ""}
    </span>
  );
}

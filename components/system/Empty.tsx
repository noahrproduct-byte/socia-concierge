import { AlertCircle } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

const DASH = String.fromCharCode(0x2014);

/**
 * An empty section keeps its frame and its header and says, in one sentence,
 * what will appear here and what to do first. Never a picture, never a fake row.
 */
export function Empty({ action, full, className, children, ...props }: HTMLAttributes<HTMLDivElement> & { action?: ReactNode; full?: boolean }) {
  return (
    <div className={cn("s-empty", full && "s-empty--full", className)} {...props}>
      <p>{children}</p>
      {action}
    </div>
  );
}

/** A flat grey bar at the final element's size. No shimmer; the layout does not shift when data lands. */
export function Skeleton({ variant = "text", width, className }: { variant?: "meta" | "text" | "title" | "value" | "block"; width?: number | string; className?: string }) {
  return <span className={cn("s-skel", `s-skel--${variant}`, className)} style={width != null ? { width } : undefined} aria-hidden />;
}

export function SkeletonStack({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("s-stack", className)} aria-busy="true" aria-live="polite">
      <span className="s-sr">Loading</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} width={`${72 - i * 12}%`} />
      ))}
    </div>
  );
}

/**
 * The honest cell. A grey dash with its reason, shown and announced. `compact`
 * keeps the reason for assistive tech only, for dense table columns whose
 * header already states the caveat.
 */
export function Unavailable({ reason, compact, className }: { reason: string; compact?: boolean; className?: string }) {
  return (
    <span className={cn("s-na", className)}>
      <span aria-hidden>{DASH}</span>
      <span className={compact ? "s-sr" : "s-na-why"}>{compact ? `Not available. ${reason}` : reason}</span>
    </span>
  );
}

/** An error inside the block that failed: what failed, when the data was last good, and Retry. */
export function ErrorBlock({ what, lastGood, onRetry, className }: { what: string; lastGood?: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn("s-error-block", className)} role="alert">
      <AlertCircle aria-hidden />
      <span>
        Couldn&apos;t load {what}.{lastGood ? ` Last good at ${lastGood}.` : ""}
      </span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PillTone = "neutral" | "positive" | "warning" | "negative" | "accent" | "outline";

/** A neutral chip: a fact beside a value (a format, a platform, a count). */
export function Chip({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("s-chip", className)} {...props} />;
}

/** A status pill: pale tint with dark ink of the same hue. `dot` adds the 6px mark. */
export function StatusPill({
  tone = "neutral",
  dot,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: PillTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={cn("s-pill", tone !== "neutral" && `s-pill--${tone}`, className)} {...props}>
      {dot && <i aria-hidden />}
      {children}
    </span>
  );
}

/** The one mapping from a post's status to a pill, so every screen agrees. */
export const POST_STATUS_PILL: Record<string, { tone: PillTone; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  pending_approval: { tone: "warning", label: "Needs approval" },
  scheduled: { tone: "accent", label: "Scheduled" },
  publishing: { tone: "accent", label: "Publishing" },
  published: { tone: "positive", label: "Published" },
  failed: { tone: "negative", label: "Failed" },
  cancelled: { tone: "outline", label: "Cancelled" },
};

export function PostStatusPill({ status, className }: { status: string; className?: string }) {
  const p = POST_STATUS_PILL[status] ?? { tone: "neutral" as PillTone, label: status.replace(/_/g, " ") };
  return (
    <StatusPill tone={p.tone} dot className={className}>
      {p.label}
    </StatusPill>
  );
}

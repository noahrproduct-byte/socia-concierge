import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The one card: 1px border, 8px radius, no shadow. `flush` for tables and lists that run edge to edge. */
export function Card({ flush, className, ...props }: HTMLAttributes<HTMLElement> & { flush?: boolean }) {
  return <section className={cn("s-card", flush && "s-card--flush", className)} {...props} />;
}

/** Title left; the card's own period and its actions right. */
export function CardHeader({
  title,
  period,
  actions,
  as: Tag = "h2",
  className,
}: {
  title: ReactNode;
  period?: ReactNode;
  actions?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("s-card-head", className)}>
      <Tag className="s-card-title">{title}</Tag>
      {(period || actions) && (
        <div className="s-card-head-actions">
          {period && <span className="s-card-period">{period}</span>}
          {actions}
        </div>
      )}
    </div>
  );
}

/** One line at the foot of a card naming the source, the sample or the formula. */
export function CardSource({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("s-source", className)}>{children}</p>;
}

/** A row of equal-width cards that collapses to one column on narrow screens. */
export function CardGrid({ cols = 2, className, style, ...props }: HTMLAttributes<HTMLDivElement> & { cols?: number }) {
  return <div className={cn("s-grid", className)} style={{ ...style, ["--cols" as string]: cols }} {...props} />;
}

/** Wraps a table so it scrolls inside its frame instead of the page. */
export function TableWrap({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("s-table-wrap s-scroll", className)} {...props} />;
}

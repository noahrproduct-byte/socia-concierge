import { Clock } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Every app screen opens with this: a noun at 24px, the Next line (today's
 * one finding, with the thing to do), a freshness stamp, and the one primary
 * action. Nothing else lives in the header.
 */
export function PageTitle({
  title,
  next,
  meta,
  stamp,
  actions,
  className,
}: {
  title: ReactNode;
  /** One sentence in the person's own data: "3 comments are waiting; the oldest is from Tuesday." */
  next?: ReactNode;
  /** Scope and source: the workspace, the period, the platforms counted. */
  meta?: ReactNode;
  /** "Updated 4 min ago". */
  stamp?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("s-title", className)}>
      <div style={{ minWidth: 0 }}>
        <h1>{title}</h1>
        {next && <p className="s-title-next">{next}</p>}
        {(meta || stamp) && (
          <div className="s-title-meta">
            {stamp && (
              <span className="s-stamp">
                <Clock aria-hidden />
                {stamp}
              </span>
            )}
            {meta}
          </div>
        )}
      </div>
      {actions && <div className="s-title-actions">{actions}</div>}
    </div>
  );
}

/** A toolbar row under the title: scope on the left (period, filters), utilities on the right. */
export function Toolbar({ end, className, children }: { end?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("s-toolbar", className)}>
      {children}
      {end && <div className="s-toolbar-end">{end}</div>}
    </div>
  );
}

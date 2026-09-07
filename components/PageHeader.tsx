import type { ReactNode } from "react";

/** The one page header every workspace page shares (same markup and classes
 *  as the Dashboard): title, one-line subtitle, an optional status line
 *  (connection, last refresh) and right-aligned actions. Renders on the
 *  server; client components may import it freely. */
export default function PageHeader({
  title,
  sub,
  status,
  actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="dv-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
        {status}
      </div>
      {actions && <div className="dv-head-actions">{actions}</div>}
    </header>
  );
}

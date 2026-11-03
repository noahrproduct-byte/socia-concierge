import "./pageSkeleton.css";

// Shown the instant a section is clicked, while the server gathers that page's
// data. It mirrors the real page frame (heading, a KPI row, then cards) so the
// content swaps in without the layout jumping.
export default function PageSkeleton({ variant = "page" }: { variant?: "page" | "analytics" | "dashboard" }) {
  const kpis = variant === "page" ? 0 : 4;
  return (
    <div className="psk" aria-busy="true" aria-live="polite">
      <span className="psk-sr">Loading…</span>
      <div className="psk-head">
        <div className="psk-b psk-title" />
        <div className="psk-b psk-sub" />
      </div>
      {variant === "analytics" && (
        <div className="psk-tabs">
          {[88, 96, 84, 80].map((w, i) => <div key={i} className="psk-b psk-tab" style={{ width: w }} />)}
        </div>
      )}
      {variant === "dashboard" && <div className="psk-b psk-hero" />}
      {kpis > 0 && (
        <div className="psk-kpis">
          {Array.from({ length: kpis }, (_, i) => <div key={i} className="psk-b psk-kpi" />)}
        </div>
      )}
      {variant === "dashboard" && <div className="psk-b psk-strip" />}
      <div className={variant === "dashboard" ? "psk-grid psk-grid--dash" : "psk-grid"}>
        <div className="psk-b psk-card tall" />
        <div className="psk-b psk-card tall" />
      </div>
      {variant === "dashboard" ? (
        <div className="psk-grid psk-grid--duo">
          <div className="psk-b psk-card wide" />
          <div className="psk-b psk-card wide" />
        </div>
      ) : (
        <div className="psk-b psk-card wide" />
      )}
    </div>
  );
}

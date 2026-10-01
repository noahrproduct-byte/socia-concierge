import type { LucideIcon } from "lucide-react";

/** A platform-general KPI tile (the sibling of KpiCard, which is bound to the
 *  Instagram Kpi type). Same ov-kpi visual language; "—" with the reason for
 *  unavailable data, never a zero. */
export default function StatTile({
  Icon,
  tone,
  label,
  value,
  note,
  status = "ok",
  delta = null,
  positive = null,
}: {
  Icon: LucideIcon;
  tone: string;
  label: string;
  value: string;
  note: string;
  status?: "ok" | "unavailable" | "collecting";
  delta?: string | null;
  positive?: boolean | null;
}) {
  return (
    <div className="ov-kpi" title={note}>
      <span className={`ov-kpi-ico ${tone}`}>
        <Icon size={16} />
      </span>
      <div className="ov-kpi-body">
        <span className="ov-kpi-label">{label}</span>
        <span className="ov-kpi-row">
          <b className={`ov-kpi-value${status === "unavailable" ? " dim" : ""}`}>{value}</b>
          {delta && <em className={`ov-kpi-delta ${positive === false ? "down" : "up"}`}>{delta}</em>}
        </span>
        <small className="ov-kpi-note">{note}</small>
      </div>
    </div>
  );
}

import { Eye, Heart, Users, FileText, Radio, type LucideIcon } from "lucide-react";
import type { Kpi } from "@/lib/overview";

const ICON: Record<Kpi["id"], { Icon: LucideIcon; tone: string }> = {
  views: { Icon: Eye, tone: "primary" },
  engagement_rate: { Icon: Heart, tone: "pink" },
  followers: { Icon: Users, tone: "info" },
  reach: { Icon: Radio, tone: "success" },
  posts: { Icon: FileText, tone: "info" },
};

/** One KPI tile: label, number, change, comparison period. Unavailable data
 *  renders as "—" with the reason underneath, never as a zero. */
export default function KpiCard({ kpi, iconLeft = false }: { kpi: Kpi; iconLeft?: boolean }) {
  const { Icon, tone } = ICON[kpi.id];
  return (
    <div className={`ov-kpi${iconLeft ? " icon-left" : ""}`} title={kpi.source}>
      <span className={`ov-kpi-ico ${tone}`}>
        <Icon size={16} />
      </span>
      <div className="ov-kpi-body">
        <span className="ov-kpi-label">{kpi.label}</span>
        <span className="ov-kpi-row">
          <b className={`ov-kpi-value${kpi.status !== "ok" ? " dim" : ""}`}>{kpi.value}</b>
          {kpi.deltaText && (
            <em className={`ov-kpi-delta ${kpi.positive === false ? "down" : "up"}`}>{kpi.deltaText}</em>
          )}
        </span>
        <small className="ov-kpi-note">{kpi.note}</small>
      </div>
    </div>
  );
}

import type { LucideIcon } from "lucide-react";
import { KpiCell } from "@/components/system";

/** A platform-general KPI tile (the Instagram view renders KpiCell directly).
 *  It is the system KpiCell: label over value, the change in words, and a grey
 *  dash with its reason for unavailable data, never a zero. `tone` is kept for
 *  existing callers; the system draws every tile in the same neutral. */
export default function StatTile({
  Icon,
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
  const na = status === "unavailable";
  return (
    <KpiCell
      icon={<Icon aria-hidden />}
      label={label}
      value={na ? null : value}
      reason={note}
      delta={delta ? { text: delta, tone: positive === false ? "bad" : positive ? "good" : undefined } : undefined}
      note={na ? undefined : note}
    />
  );
}

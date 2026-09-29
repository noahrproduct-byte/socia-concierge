import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { requireFeature } from "@/lib/planGuard";
import { clampDays, canUseFeature } from "@/lib/entitlements";
import { loadReport } from "@/lib/reportData";
import { presetPeriod, customPeriod, reportToCsv, type ReportPlatform } from "@/lib/reports";
import { getActiveWorkspace } from "@/lib/workspaces";

export const runtime = "nodejs";

// CSV export of the active workspace's period report. Growth+ (report_exports),
// scoped to the workspace owner. The window still obeys the plan's history limit.
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const ctx = await resolveContext(supabase, user.id);
  const g = await requireFeature(ctx.client, ctx.ownerId, "report_exports");
  if (g.denied) return g.denied;

  const url = new URL(req.url);
  const platform = (["instagram", "youtube"].includes(url.searchParams.get("platform") ?? "") ? url.searchParams.get("platform") : "all") as ReportPlatform | "all";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const now = new Date();
  let period = presetPeriod(url.searchParams.get("range") ?? "30", now);
  if (from && to && canUseFeature(g.ent, "custom_date_ranges")) {
    const c = customPeriod(from, to, now);
    if (c) period = c;
  }
  // Honour the plan's history window.
  period = { ...period, days: clampDays(g.ent, period.days) };

  const ws = await getActiveWorkspace(supabase, user.id);
  const name = ws?.name ?? "My brand";
  const report = await loadReport(ctx.client, ctx.ownerId, name, period, platform);
  const csv = reportToCsv(report);
  const filename = `socia-report-${period.days}d-${now.toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

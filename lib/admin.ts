// Gate for internal diagnostic endpoints (instagram/inspect, instagram/daily-probe,
// dashboard-audit). These expose internal formulas/provenance and fire live Meta
// calls, so they must not be open to every signed-in user in production.
//
// Open in non-production; in production, only for the emails listed in
// ADMIN_EMAILS (comma-separated). Callers 404 when this is false, so the
// endpoint reads as nonexistent rather than forbidden.
//
// Server only.
export function isAdminEmail(email: string | null | undefined): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && allow.includes(email.toLowerCase()));
}

// Settings, Plan & billing. Server component: the real plan, the real meters,
// and the downgrade "choose what to keep" state. Reads nothing itself; the
// page hands it entitlements, usage and the account/competitor lists.
//
// Honesty rules: a counter that could not be read renders a dash, never 0.
// There is no Manage or Cancel button because nothing exists behind them yet.

import Link from "next/link";
import "@/app/settings/plan-billing.css";
import {
  FEATURE_STATUS, METER_LABEL, METER_PERIOD, PRICING_PATH, checkoutAvailable, contactHref, formatHistory, formatPrice,
  type MeterKey,
} from "@/lib/plans";
import { formatResetDate } from "@/lib/planErrors";
import {
  getLimit, workspacesInUse,
  type ConnectedAccount, type Entitlements, type OverLimits, type UsageSnapshot,
} from "@/lib/entitlements";
import PlanKeepChooser, { type KeepAccount, type KeepCompetitor } from "./PlanKeepChooser";

const METER_ORDER: MeterKey[] = ["ask_socia", "content_studio", "content_ideas", "content_plan", "content_generation", "account_audit"];

function Meter({
  label,
  used,
  limit,
  note,
  unknownTitle = "Not recorded yet",
  plain,
}: {
  label: string;
  /** null = could not be read. Never invented. */
  used: number | null;
  limit: number;
  note?: string;
  unknownTitle?: string;
  /** Render this text instead of a count and bar (a limit with no live counter yet). */
  plain?: string;
}) {
  const notIncluded = limit <= 0;
  const unknown = used == null;
  const ratio = notIncluded || unknown ? 0 : Math.min(1, used / limit);
  const tone = !unknown && !notIncluded && used >= limit ? " out" : ratio >= 0.8 ? " near" : "";
  return (
    <li className="pb-meter">
      <span className="pb-meter-label">{label}</span>
      {plain ? (
        <span className="pb-meter-val">{plain}</span>
      ) : notIncluded ? (
        <span className="pb-meter-val">Not included</span>
      ) : unknown ? (
        <span className="pb-meter-val na" title={unknownTitle} aria-label={unknownTitle}>–</span>
      ) : (
        <span className="pb-meter-val">{used} / {limit}</span>
      )}
      {!plain && !notIncluded && (
        <span className="pb-bar" aria-hidden>
          <span className={`pb-bar-fill${tone}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
        </span>
      )}
      {note && <span className="pb-meter-note">{note}</span>}
    </li>
  );
}

export default function PlanBilling({
  ent,
  usage,
  accounts,
  activeCount,
  competitorCount,
  competitors,
  overLimits,
  teamUsed = null,
}: {
  ent: Entitlements;
  usage: Record<MeterKey, UsageSnapshot>;
  accounts: ConnectedAccount[];
  /** Active connected accounts; null when a platform table could not be read (the list is then a lower bound). */
  activeCount: number | null;
  /** Active competitors; null when the count could not be read. */
  competitorCount: number | null;
  /** Every tracked competitor, including paused ones. Only needed in the over-limit state. */
  competitors: KeepCompetitor[] | null;
  overLimits: OverLimits;
  /** Team seats in use (you + distinct members across your workspaces); null when unknown. */
  teamUsed?: number | null;
}) {
  const cfg = ent.config;
  const workspaceLimit = getLimit(ent, "workspaces");
  const competitorLimit = getLimit(ent, "competitors");
  const memberLimit = getLimit(ent, "team_members");
  const historyDays = getLimit(ent, "analytics_history_days");
  // Workspaces in use is derived from the accounts (a workspace holds one
  // account per platform); unknown when a platform table could not be read.
  const workspacesUsed = activeCount == null ? null : workspacesInUse(accounts);
  const teamSoon = FEATURE_STATUS.team === "coming_soon";

  const keepAccounts = overLimits.accounts
    ? {
        limit: overLimits.accounts.limit,
        active: overLimits.accounts.active,
        byPlatform: overLimits.accounts.byPlatform,
        items: accounts.map<KeepAccount>((a) => ({
          id: a.id, label: a.label, handle: a.handle, platform: a.platform, suspended: a.suspended, current: a.current,
        })),
      }
    : null;
  const keepCompetitors = overLimits.competitors && competitors
    ? { limit: overLimits.competitors.limit, active: overLimits.competitors.active, items: competitors }
    : null;

  const weekly = METER_ORDER.filter((m) => METER_PERIOD[m] === "week" && usage[m].limit > 0);
  const weekReset = weekly.length ? usage[weekly[0]].resetsOn : null;

  return (
    <>
      <div className="st2-plan">
        <div>
          <div className="st2-plan-name">
            {cfg.name} <span className="pb-price">· {formatPrice(cfg)}/month</span> <span className="st2-badge">Current</span>
          </div>
          <p>{cfg.tagline}</p>
        </div>
      </div>

      {(keepAccounts || keepCompetitors) && (
        <PlanKeepChooser planName={cfg.name} accounts={keepAccounts} competitors={keepCompetitors} />
      )}

      <ul className="pb-meters">
        <Meter
          label="Brand Workspaces"
          used={workspacesUsed}
          limit={workspaceLimit}
          unknownTitle="Could not be read"
          note="One workspace holds one account on each platform."
        />
        <Meter
          label="Team members"
          used={teamSoon ? null : teamUsed}
          limit={memberLimit}
          plain={teamSoon ? `1 of ${memberLimit} (invites coming soon)` : undefined}
          unknownTitle="Could not be read"
          note={teamSoon ? undefined : "You included, across all your workspaces."}
        />
        <Meter label="Competitors" used={competitorCount} limit={competitorLimit} unknownTitle="Could not be read" />
        <Meter label="Analytics history" used={null} limit={historyDays} plain={formatHistory(historyDays)} />
        {METER_ORDER.map((m) => (
          <Meter
            key={m}
            label={METER_LABEL[m]}
            used={usage[m].used}
            limit={usage[m].limit}
            note={METER_PERIOD[m] === "week" ? "Per week" : undefined}
          />
        ))}
      </ul>
      <p className="pb-reset">
        Monthly usage resets on {formatResetDate(ent.periods.month.end)}.
        {weekReset ? ` Weekly usage resets on ${formatResetDate(weekReset)}.` : ""}
      </p>

      <div className="pb-actions">
        <Link href={PRICING_PATH} className="btn-secondary">Compare plans</Link>
        {!checkoutAvailable() && (
          <p>
            Checkout is opening soon. To change your plan today,{" "}
            <a href={contactHref("SOCIA plan change")}>contact us</a>.
          </p>
        )}
      </div>
    </>
  );
}

// Settings, Plan & billing. Server component: the real plan, the real meters,
// and the downgrade "choose what to keep" state. Reads nothing itself; the
// page hands it entitlements, usage and the account/competitor lists.
//
// Honesty rules: a counter that could not be read renders a dash, never 0.
// There is no Manage or Cancel button because nothing exists behind them yet.

import Link from "next/link";
import "@/app/settings/plan-billing.css";
import { METER_LABEL, PRICING_PATH, checkoutAvailable, contactHref, formatPrice, type MeterKey } from "@/lib/plans";
import { formatResetDate } from "@/lib/planErrors";
import {
  getLimit,
  type ConnectedAccount, type Entitlements, type OverLimits, type UsageSnapshot,
} from "@/lib/entitlements";
import PlanKeepChooser, { type KeepAccount, type KeepCompetitor } from "./PlanKeepChooser";

const METER_ORDER: MeterKey[] = ["ask_socia", "content_studio", "content_generation", "account_audit", "content_plan"];

function Meter({
  label,
  used,
  limit,
  note,
  unknownTitle = "Not recorded yet",
  soon = false,
}: {
  label: string;
  /** null = could not be read. Never invented. */
  used: number | null;
  limit: number;
  note?: string;
  unknownTitle?: string;
  /**
   * The limit belongs to a feature that is not built yet: show what the plan
   * will include as plain text, with no count and no bar. Distinct from an
   * unknown count (which is a real meter whose value could not be read).
   */
  soon?: boolean;
}) {
  const notIncluded = limit <= 0;
  const unknown = used == null;
  const ratio = notIncluded || unknown ? 0 : Math.min(1, used / limit);
  const tone = !unknown && !notIncluded && used >= limit ? " out" : ratio >= 0.8 ? " near" : "";
  return (
    <li className="pb-meter">
      <span className="pb-meter-label">{label}</span>
      {soon ? (
        <span className="pb-meter-val">{limit} {limit === 1 ? "seat" : "seats"} when available</span>
      ) : notIncluded ? (
        <span className="pb-meter-val">Not included</span>
      ) : unknown ? (
        <span className="pb-meter-val na" title={unknownTitle} aria-label={unknownTitle}>–</span>
      ) : (
        <span className="pb-meter-val">{used} / {limit}</span>
      )}
      {!soon && !notIncluded && (
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
}) {
  const cfg = ent.config;
  const accountLimit = getLimit(ent, "connected_accounts");
  const competitorLimit = getLimit(ent, "competitors");
  const seats = getLimit(ent, "team_seats");

  const keepAccounts = overLimits.accounts
    ? {
        limit: overLimits.accounts.limit,
        active: overLimits.accounts.active,
        items: accounts.map<KeepAccount>((a) => ({
          id: a.id, label: a.label, handle: a.handle, platform: a.platform, suspended: a.suspended, current: a.current,
        })),
      }
    : null;
  const keepCompetitors = overLimits.competitors && competitors
    ? { limit: overLimits.competitors.limit, active: overLimits.competitors.active, items: competitors }
    : null;

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
        <Meter label="Connected accounts" used={activeCount} limit={accountLimit} unknownTitle="Could not be read" />
        <Meter label="Competitors" used={competitorCount} limit={competitorLimit} unknownTitle="Could not be read" />
        {METER_ORDER.map((m) => (
          <Meter key={m} label={METER_LABEL[m]} used={usage[m].used} limit={usage[m].limit} />
        ))}
        <Meter label="Team seats" used={null} limit={seats} soon note="Team features are coming soon" />
      </ul>
      <p className="pb-reset">Usage resets on {formatResetDate(ent.period.end)}.</p>

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

// Settings, Plan & billing. Server component: the real plan, the real meters,
// and the downgrade "choose what to keep" state. Reads nothing itself; the
// page hands it entitlements, usage and the account/competitor lists.
//
// Honesty rules: a counter that could not be read renders a dash, never 0.
// The billing line (renewal, trial, cancellation) is what Stripe last told us;
// Manage billing opens Stripe's own portal for card, plan and cancellation.

import Link from "next/link";
import "@/app/(app)/settings/plan-billing.css";
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
import ManageBillingButton from "./ManageBillingButton";
import type { BillingInfo } from "@/lib/billing";
import type { PlanConfig } from "@/lib/plans";

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** One plain sentence about where the subscription stands, from Stripe's last update. */
function billingLine(b: BillingInfo, cfg: PlanConfig): string | null {
  // SOCIA sells monthly prices; a yearly subscription (only possible from inside Stripe) shows no amount rather than a wrong one.
  const amount = b.interval === "month" ? `${formatPrice(cfg)}/month` : null;
  if (b.plan === "free") return b.status === "canceled" ? "Your subscription has ended. You're on Free." : null;
  if (b.status === "past_due") return `Your last payment failed. Update your card in Manage billing to keep ${cfg.name}.`;
  if (b.cancelAt) return `Cancels on ${fmtDay(b.cancelAt)}. You keep ${cfg.name} until then.`;
  if (b.status === "trialing" && b.trialEnd) return `Free trial until ${fmtDay(b.trialEnd)}${amount ? `, then ${amount}` : ""}.`;
  if (b.status === "active" && b.currentPeriodEnd) return `Renews on ${fmtDay(b.currentPeriodEnd)}${amount ? ` · ${amount}` : ""}.`;
  return null;
}

const METER_ORDER: MeterKey[] = ["ask_socia", "content_studio", "content_build", "content_ideas", "content_plan", "content_generation", "account_audit"];

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
  billing = null,
  notice = null,
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
  /** Subscription state mirrored from Stripe; null before billing exists. */
  billing?: BillingInfo | null;
  /** A one-off message, e.g. just back from Checkout. */
  notice?: { tone: "good" | "info" | "warning"; text: string } | null;
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
      {notice && <p className={`pb-notice ${notice.tone}`} role="status">{notice.text}</p>}
      <div className="st2-plan">
        <div>
          <div className="st2-plan-name">
            {cfg.name}{" "}
            <span className="pb-price">· {formatPrice(cfg)}/month</span>{" "}
            <span className="st2-badge">Current</span>
          </div>
          <p>{cfg.tagline}</p>
          {billing && billingLine(billing, cfg) && <p className="pb-billing-line">{billingLine(billing, cfg)}</p>}
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
        <Link href={PRICING_PATH} className="btn-secondary">{ent.plan === "free" && checkoutAvailable() ? "Upgrade" : "Compare plans"}</Link>
        {billing?.hasCustomer && checkoutAvailable() && <ManageBillingButton />}
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

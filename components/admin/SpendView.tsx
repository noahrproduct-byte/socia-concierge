// The admin spend page's body (app/(app)/admin/spend), drawn from a summary
// (lib/spendCore.ts). Also rendered on fixture numbers at /dev/spend-lab.
import { Card, CardHeader, CardSource, CardGrid, KpiStrip, KpiCell, TableWrap, Unavailable } from "@/components/system";
import { PLANS } from "@/lib/plans";
import { modelById } from "@/lib/credits/config";
import { usd, type SpendSummary } from "@/lib/spendCore";

const PROVIDER_NAME: Record<string, string> = { anthropic: "Claude", higgsfield: "Higgsfield" };
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short" });

export default function SpendView({ s }: { s: SpendSummary }) {
  const total = s.ai && s.higgsfield ? s.ai.month + s.higgsfield.month : null;
  const forecast = s.ai && s.higgsfield ? s.ai.forecast + s.higgsfield.forecast : null;

  return (
    <>
      <KpiStrip cols={4}>
        <KpiCell label="AI cost so far this month" value={total == null ? null : usd(total)} reason="A cost table couldn't be read." />
        <KpiCell label="Month at this pace" value={forecast == null ? null : usd(forecast)} reason="A cost table couldn't be read." note="This month so far, spread over the whole month" />
        <KpiCell label="Paid subscriptions a month" value={s.revenue ? usd(s.revenue.monthly) : null} reason="Subscriptions couldn't be read." note={s.revenue ? `${s.revenue.subscriptions} live, ${usd(s.revenue.afterFees)} after payment fees` : undefined} />
        <KpiCell label="AI cost against revenue" value={s.costShare == null ? null : `${Math.round(s.costShare * 100)}%`} reason={s.revenue && s.revenue.afterFees <= 0 ? "No paid subscriptions yet." : "A cost or revenue figure couldn't be read."} note="Month at this pace, against revenue after fees" />
      </KpiStrip>

      <CardGrid cols={2} style={{ marginTop: "var(--sp-5)" }}>
        <Card>
          <CardHeader title="Claude and other AI calls" period="This month" />
          {s.ai ? (
            <>
              <KpiStrip cols={3}>
                <KpiCell label="So far" value={usd(s.ai.month)} note={s.ai.calls == null ? undefined : `${s.ai.calls.toLocaleString("en-US")} calls`} />
                <KpiCell label="Month at this pace" value={usd(s.ai.forecast)} />
                <KpiCell label="Last month" value={s.ai.lastMonth == null ? null : usd(s.ai.lastMonth)} reason="Last month couldn't be read." />
              </KpiStrip>
              <p>Set Anthropic&apos;s auto-reload to add about <b>{usd(s.ai.reload)}</b> when the balance drops under that amount (about a week at this pace). Anthropic Console, Settings, Billing.</p>
            </>
          ) : <Unavailable reason="The AI cost table (supabase/ai-spend.sql) couldn't be read." />}
          <CardSource>From every AI call&apos;s recorded cost (lib/aiSpend.ts): Claude, plus transcription, music and voiceovers, which are billed by other services. So the Anthropic figure is a little lower than this.</CardSource>
        </Card>

        <Card>
          <CardHeader title="Higgsfield (AI Studio)" period="This month" />
          {s.higgsfield ? (
            <>
              <KpiStrip cols={3}>
                <KpiCell label="So far" value={usd(s.higgsfield.month)} note={`${s.higgsfield.count.toLocaleString("en-US")} ${s.higgsfield.count === 1 ? "generation" : "generations"}`} />
                <KpiCell label="Month at this pace" value={usd(s.higgsfield.forecast)} />
                <KpiCell label="Top-up size" value={usd(s.higgsfield.reload)} note="About a week at this pace" />
              </KpiStrip>
              <TableWrap>
                <table className="s-table">
                  <thead><tr><th>Day</th><th className="num">Generations</th><th className="num">Cost</th></tr></thead>
                  <tbody>
                    {s.higgsfield.days.map((d) => (
                      <tr key={d.day}><td>{day(d.day)}</td><td className="num">{d.count}</td><td className="num">{usd(d.usd)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              {s.higgsfield.models.length > 0 && (
                <p>By model this month: {s.higgsfield.models.map((m) => `${modelById(m.model)?.name ?? m.model} ${usd(m.usd)} (${m.count})`).join(", ")}.</p>
              )}
            </>
          ) : <Unavailable reason="AI Studio's jobs (supabase/ai-studio.sql) couldn't be read." />}
          <CardSource>From the price Higgsfield quoted for each finished generation. Generations a customer deleted are not counted.</CardSource>
        </Card>
      </CardGrid>

      <CardGrid cols={2} style={{ marginTop: "var(--sp-5)" }}>
        <Card flush>
          <CardHeader title="Highest AI cost accounts" period="This month" />
          {s.topAccounts == null ? <Unavailable reason="The AI cost table couldn't be read." /> : s.topAccounts.length === 0 ? <p style={{ padding: "0 var(--sp-4)" }}>No AI use recorded this month yet.</p> : (
            <TableWrap>
              <table className="s-table">
                <thead><tr><th>Account</th><th>Plan</th><th className="num">AI cost</th><th className="num">Plan ceiling</th></tr></thead>
                <tbody>
                  {s.topAccounts.map((a) => (
                    <tr key={a.userId}>
                      <td>{a.email ?? a.userId.slice(0, 8)}</td>
                      <td>{PLANS[a.plan].name}</td>
                      <td className="num">{usd(a.micros / 1_000_000)}</td>
                      <td className="num">{usd(a.capUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
          <CardSource>The ceiling pauses an account&apos;s AI for the rest of the month (lib/plans.ts aiSpendCapUsd); referral and stay bonuses can raise it.</CardSource>
        </Card>

        <Card>
          <CardHeader title="Empty balance alerts" />
          <p>When Claude or Higgsfield refuses a request because SOCIA&apos;s balance is empty, every admin gets an alert in the bell, at most once a day for each service. Customers see that AI is paused on SOCIA&apos;s side.</p>
          {s.lastAlarms == null ? <Unavailable reason="Alerts (supabase/alerts.sql) couldn't be read." /> : s.lastAlarms.length === 0 ? (
            <p>No balance has run out so far.</p>
          ) : (
            <ul>
              {s.lastAlarms.map((a, i) => <li key={i}>{PROVIDER_NAME[a.provider] ?? a.provider} ran out: {when(a.at)}</li>)}
            </ul>
          )}
          {s.revenue && s.revenue.byPlan.length > 0 && (
            <p>Paid subscriptions: {s.revenue.byPlan.map((p) => `${PLANS[p.plan].name} ${p.count} (${usd(p.monthly)})`).join(", ")}.</p>
          )}
        </Card>
      </CardGrid>
    </>
  );
}

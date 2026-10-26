// The Weekly roundup, laid out on the design system. Presentation only:
// app/(app)/roundup/page.tsx resolves the plan gate and builds the roundup.

import { CalendarCheck, Lock } from "lucide-react";
import { ButtonLink, Card, CardGrid, CardHeader, CardSource, Chip, Empty, KpiCell, KpiStrip, PageTitle } from "@/components/system";
import type { RoundupItem, WeeklyRoundup } from "@/lib/weeklyRoundup";
import "@/app/(app)/analytics/analytics.css";

const TITLE = "Weekly roundup";

function Section({ title, items, empty }: { title: string; items: RoundupItem[]; empty: string }) {
  return (
    <Card>
      <CardHeader title={title} actions={items.length > 0 ? <Chip aria-label={`${items.length} items`}>{items.length}</Chip> : undefined} />
      {items.length ? (
        <ul className="an-list">
          {items.map((it, i) => (
            <li key={i}>
              <div className="an-row-body">
                <b>{it.title}</b>
                <small>{it.body}</small>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{empty}</Empty>
      )}
    </Card>
  );
}

/** Plans without the roundup see what it is and the plan that includes it. */
export function RoundupLocked({ plan, href }: { plan: string; href: string }) {
  return (
    <div className="an-stack">
      <PageTitle title={TITLE} next="Your niche, your competitors and your wins, rolled up once a week." />
      <Card>
        <div className="s-empty">
          <Lock aria-hidden />
          <b>Weekly roundup is on {plan}</b>
          <p>Every week SOCIA rolls up what&apos;s trending in your niche, how your tracked competitors moved, your breakout posts, and the one format you&apos;re under-using, all from your real data, never estimated.</p>
          <div className="an-actions">
            <ButtonLink href={href} variant="primary">
              Upgrade to {plan}
            </ButtonLink>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function RoundupView({ wsName, roundup }: { wsName: string; roundup: WeeklyRoundup }) {
  const meta = (
    <span>
      {wsName} · {roundup.rangeLabel}
    </span>
  );

  if (roundup.empty) {
    return (
      <div className="an-stack">
        <PageTitle title={TITLE} meta={meta} />
        <Card>
          <div className="s-empty">
            <CalendarCheck aria-hidden />
            <b>Your first roundup is on its way</b>
            <p>Connect an account and track a few competitors. Next week this page fills with your niche&apos;s trends, how competitors moved, and your best posts. It appears as the data accrues; nothing is estimated.</p>
            <div className="an-actions">
              <ButtonLink href="/settings#accounts" variant="primary">
                Connect an account
              </ButtonLink>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="an-stack">
      <PageTitle title={TITLE} meta={meta} />

      {roundup.connected && roundup.kpis.length > 0 && (
        <KpiStrip cols={roundup.kpis.length}>
          {roundup.kpis.map((k) => (
            <KpiCell
              key={k.id}
              label={k.label}
              value={k.raw == null ? null : k.value}
              reason={k.note || "Not reported this week"}
              delta={k.deltaText ? { text: k.deltaText, tone: k.positive === false ? "bad" : k.positive ? "good" : undefined } : undefined}
            />
          ))}
        </KpiStrip>
      )}

      {roundup.scorecard && roundup.scorecard.lines.length > 0 && (
        <Card>
          <CardHeader
            title="Your week"
            actions={
              <ButtonLink href="/tool" variant="ghost" size="sm">
                Open your Content Plan
              </ButtonLink>
            }
          />
          <ul className="an-list">
            {roundup.scorecard.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Card>
      )}

      <CardGrid cols={2}>
        <Section title="Trending in your niche" items={roundup.trends} empty="No breakout niche trend this week. Run discovery on the Competitors page to surface more." />
        <Section title="Competitor moves" items={roundup.competitorMoves} empty="No significant competitor follower moves this week." />
        <Section
          title="Your breakout posts"
          items={roundup.breakouts}
          empty={roundup.connected ? "No post broke out past your format median this week." : "Connect Instagram to see your breakout posts."}
        />
        <Section title="Where you could win" items={roundup.opportunities} empty="No clear format gap this week; your mix matches what's winning." />
      </CardGrid>

      <CardSource>
        Rolled up from your workspace&apos;s own data and the same detectors behind your alerts. A line appears only when the numbers clear the bar; nothing here is estimated.
      </CardSource>
    </div>
  );
}

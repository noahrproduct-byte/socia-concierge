import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Flame, Users, Zap, Lightbulb, ArrowRight, Sparkles, CalendarCheck } from "lucide-react";
import { getViewer } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import PageHeader from "@/components/PageHeader";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { minPlanWithFeature, pricingHref, PLANS } from "@/lib/plans";
import { getActiveWorkspace } from "@/lib/workspaces";
import { buildWeeklyRoundup, type RoundupItem } from "@/lib/weeklyRoundup";
import "./roundup.css";

export const metadata = { title: "Weekly roundup — SOCIA" };

function Section({ icon, title, items, empty }: { icon: ReactNode; title: string; items: RoundupItem[]; empty: string }) {
  return (
    <section className="ru-card">
      <div className="ru-card-head">
        <span className="ru-ico" aria-hidden>{icon}</span>
        <h2>{title}</h2>
        {items.length > 0 && <span className="ru-count">{items.length}</span>}
      </div>
      {items.length ? (
        <ul className="ru-list">
          {items.map((it, i) => (
            <li key={i}><b>{it.title}</b><small>{it.body}</small></li>
          ))}
        </ul>
      ) : (
        <p className="ru-empty">{empty}</p>
      )}
    </section>
  );
}

export default async function RoundupPage() {
  const { supabase, user } = await getViewer();
  if (!user) redirect("/login");
  const ctx = await resolveContext(supabase, user.id);
  const [ent, ws] = await Promise.all([
    getEntitlements(ctx.client, ctx.ownerId),
    getActiveWorkspace(supabase, user.id),
  ]);

  // Starter and up. A plan without it sees what the feature is and how to get it.
  if (!canUseFeature(ent, "weekly_trend_roundup")) {
    const plan = minPlanWithFeature("weekly_trend_roundup") ?? "starter";
    return (
      <>
        <PageHeader title="Weekly roundup" sub="Your niche, your competitors and your wins — rolled up once a week." />
        <div className="ru-gate">
          <span className="ru-gate-ico" aria-hidden><Sparkles size={22} /></span>
          <h2>Weekly roundup is on {PLANS[plan].name}</h2>
          <p>Every week SOCIA rolls up what&apos;s trending in your niche, how your tracked competitors moved, your breakout posts, and the one format you&apos;re under-using — all from your real data, never estimated.</p>
          <Link href={pricingHref(plan)} className="ru-cta">Upgrade to {PLANS[plan].name} <ArrowRight size={15} /></Link>
        </div>
      </>
    );
  }

  const roundup = await buildWeeklyRoundup(ctx.client, ctx.ownerId, ws?.id ?? null, new Date());

  return (
    <>
      <PageHeader title="Weekly roundup" sub={`${ws?.name ?? "Your brand"} · ${roundup.rangeLabel}`} />

      {roundup.empty ? (
        <div className="ru-gate">
          <span className="ru-gate-ico" aria-hidden><Sparkles size={22} /></span>
          <h2>Your first roundup is on its way</h2>
          <p>Connect an account and track a few competitors. Next week this page fills with your niche&apos;s trends, how competitors moved, and your best posts — it appears as the data accrues, nothing is estimated.</p>
          <Link href="/settings#accounts" className="ru-cta">Connect an account <ArrowRight size={15} /></Link>
        </div>
      ) : (
        <>
          {roundup.connected && roundup.kpis.length > 0 && (
            <div className="ru-kpis">
              {roundup.kpis.map((k) => (
                <div key={k.id} className="ru-kpi">
                  <span className="ru-kpi-label">{k.label}</span>
                  <b className={k.raw == null ? "dim" : ""}>{k.value}</b>
                  {k.deltaText && <em className={k.positive === false ? "down" : "up"}>{k.deltaText}</em>}
                </div>
              ))}
            </div>
          )}
          {roundup.scorecard && roundup.scorecard.lines.length > 0 && (
            <section className="ru-card ru-week" aria-labelledby="ru-week-h">
              <div className="ru-card-head">
                <span className="ru-ico" aria-hidden><CalendarCheck size={15} /></span>
                <h2 id="ru-week-h">Your week</h2>
              </div>
              <ul className="ru-list">
                {roundup.scorecard.lines.map((l) => <li key={l}><small>{l}</small></li>)}
              </ul>
              <Link href="/tool" className="ru-week-link">Open your Content Plan <ArrowRight size={13} /></Link>
            </section>
          )}
          <div className="ru-grid">
            <Section icon={<Flame size={15} />} title="Trending in your niche" items={roundup.trends}
              empty="No breakout niche trend this week. Run discovery on the Competitors page to surface more." />
            <Section icon={<Users size={15} />} title="Competitor moves" items={roundup.competitorMoves}
              empty="No significant competitor follower moves this week." />
            <Section icon={<Zap size={15} />} title="Your breakout posts" items={roundup.breakouts}
              empty={roundup.connected ? "No post broke out past your format median this week." : "Connect Instagram to see your breakout posts."} />
            <Section icon={<Lightbulb size={15} />} title="Where you could win" items={roundup.opportunities}
              empty="No clear format gap this week — your mix matches what's winning." />
          </div>
          <p className="ru-foot">Rolled up from your workspace&apos;s own data and the same detectors behind your alerts. A line appears only when the numbers clear the bar — nothing here is estimated.</p>
        </>
      )}
    </>
  );
}

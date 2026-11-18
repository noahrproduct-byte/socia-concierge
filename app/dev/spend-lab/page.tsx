import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import SpendView from "@/components/admin/SpendView";
import { summarizeSpend, type SpendFacts } from "@/lib/spendCore";

export const metadata = { title: "Spend lab", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** The admin spend page on fixture numbers (?empty=1 for unreadable tables). Development only: production answers 404. */
export default async function SpendLab({ searchParams }: { searchParams: Promise<{ empty?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { empty } = await searchParams;
  const now = new Date();
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  const facts: SpendFacts = empty ? { now, aiMonthMicros: null, aiMonthCalls: null, aiLastMonthMicros: null, topAccounts: null, generations: null, subscriptions: null, lastAlarms: null } : {
    now,
    aiMonthMicros: 38_420_000, aiMonthCalls: 2140, aiLastMonthMicros: 51_900_000,
    topAccounts: [
      { userId: "a1", email: "owner@cafe.example", plan: "scale", micros: 14_200_000, capUsd: 42 },
      { userId: "a2", email: "agency@example.com", plan: "pro", micros: 9_800_000, capUsd: 42 },
      { userId: "a3", email: null, plan: "starter", micros: 2_100_000, capUsd: 3 },
    ],
    generations: [
      { at: ago(3), usd: 0.357, model: "kling-3.0-standard" }, { at: ago(4), usd: 0.375, model: "wan-3.0" },
      { at: ago(28), usd: 0.714, model: "kling-3.0-standard" }, { at: ago(52), usd: 1.3235, model: "seedance-2.5" },
      { at: ago(100), usd: 0.357, model: "kling-3.0-standard" },
    ],
    subscriptions: [{ plan: "scale", cents: 7999 }, { plan: "pro", cents: 4999 }, { plan: "starter", cents: 1999 }, { plan: "starter", cents: 1999 }],
    lastAlarms: [{ provider: "higgsfield", at: ago(30) }],
  };
  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader title="AI spend" sub="Fixture numbers. The real page is /admin/spend, for admins only." />
      <SpendView s={summarizeSpend(facts)} />
    </div>
  );
}

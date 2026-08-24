import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ChatClient, { type StrategistContext } from "@/components/ChatClient";
import { getIgSnapshot, type IgMediaItem } from "@/lib/instagramSync";
import type { NicheIntel } from "@/lib/schema";

export const metadata = { title: "AI Strategist — SOCIA" };

const engOf = (m: IgMediaItem) => (m.like_count ?? 0) + (m.comments_count ?? 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Real account context for the strategist workspace (all best-effort).
  let goal: string | null = null;
  let niche: string | null = null;
  let subNiche: string | null = null;
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("goals, niche, niche_detail")
      .eq("user_id", user.id)
      .maybeSingle();
    goal = prof?.goals ?? null;
    niche = prof?.niche ?? null;
    subNiche = (prof?.niche_detail as { sub_niche?: string } | null)?.sub_niche ?? null;
  } catch {
    // profile columns may be mid-migration; the workspace degrades gracefully
  }

  const snap = await getIgSnapshot(supabase, user.id);
  const media = snap?.media ?? [];
  const engRate =
    snap?.followers_count && media.length
      ? ((avg(media.map(engOf)) / snap.followers_count) * 100).toFixed(1) + "%"
      : null;

  // Recent insights from the cached niche briefing (never fabricated).
  const insights: StrategistContext["insights"] = [];
  if (niche) {
    try {
      const { data: cached } = await supabase
        .from("niche_trends")
        .select("data")
        .eq("niche", `${user.id}:${niche}`)
        .maybeSingle();
      const doc = cached?.data as NicheIntel | undefined;
      if (doc?.v === 3 && doc.breakout) {
        insights.push({
          tone: "green",
          text: `${doc.stats.momentum_label} are gaining traction in your niche.`,
          sub: `+${doc.stats.momentum_pct || doc.breakout.momentum_pct}% est. momentum this week`,
        });
        if (doc.trends[0]) {
          insights.push({ tone: "blue", text: doc.trends[0].why, sub: doc.trends[0].title });
        }
        if (doc.actions[0]) {
          insights.push({
            tone: "amber",
            text: doc.actions[0].title,
            sub: doc.actions[0].impact || "Recommended next move",
          });
        }
      }
    } catch {
      // no briefing yet — the rail links to Niche Trends instead
    }
  }

  const raw = (user.email?.split("@")[0] ?? "").replace(/[._-]+/g, " ");
  const name = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : null;

  const context: StrategistContext = {
    name,
    goal,
    niche,
    subNiche,
    username: snap?.username ?? null,
    mediaCount: media.length,
    engRate,
    posts: media.filter((m) => m.timestamp).map((m) => ({ t: m.timestamp!, e: engOf(m) })),
    insights,
  };

  return (
    <AppShell active="chat" userEmail={user.email} dark>
      <ChatClient context={context} />
    </AppShell>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ContentPlanClient, { type PlanContext } from "@/components/ContentPlanClient";
import { getIgSnapshot, type IgMediaItem } from "@/lib/instagramSync";
import type { GenerateInput } from "@/lib/schema";

export const metadata = { title: "Content Plan — SOCIA" };

const engOf = (m: IgMediaItem) => (m.like_count ?? 0) + (m.comments_count ?? 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function bestTime(media: IgMediaItem[]): string | null {
  const buckets = new Map<string, { score: number; label: string }>();
  for (const m of media) {
    if (!m.timestamp) continue;
    const d = new Date(m.timestamp);
    const day = d.toLocaleDateString("en-US", { weekday: "short" });
    const hour = d.getHours();
    const ampm = hour === 0 ? "12AM" : hour < 12 ? `${hour}AM` : hour === 12 ? "12PM" : `${hour - 12}PM`;
    const key = `${day}-${hour}`;
    const cur = buckets.get(key) ?? { score: 0, label: `${day} ${ampm}` };
    cur.score += engOf(m);
    buckets.set(key, cur);
  }
  let best: { score: number; label: string } | null = null;
  for (const b of buckets.values()) if (!best || b.score > best.score) best = b;
  return best?.label ?? null;
}

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const FMT: Record<string, string> = {
  VIDEO: "Reel",
  CAROUSEL_ALBUM: "Carousel",
  IMAGE: "Static",
};

// Summarize the account's real recent posts as "one per line" form input,
// kept under the field's soft 500-char guide.
function recentLines(media: IgMediaItem[]): string {
  const lines: string[] = [];
  for (const m of media) {
    if (!m.caption) continue;
    const first = m.caption.split("\n")[0].trim().slice(0, 48);
    const fmt = FMT[m.media_type ?? ""] ?? "Post";
    const eng: string[] = [];
    if (typeof m.like_count === "number") eng.push(`${m.like_count.toLocaleString("en-US")} likes`);
    if (typeof m.comments_count === "number")
      eng.push(`${m.comments_count.toLocaleString("en-US")} comments`);
    const line = `${fmt}: ${first}${eng.length ? ` — ${eng.join(" · ")}` : ""}`;
    if (lines.join("\n").length + line.length + 1 > 500) break;
    lines.push(line);
    if (lines.length >= 4) break;
  }
  return lines.join("\n");
}

export default async function ContentPlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Prefill everything SOCIA already knows (all best-effort).
  let brandName: string | null = null;
  let niche: string | null = null;
  let nicheDetected = false;
  let goal: string | null = null;
  let platform: string | null = null;
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("brand_name, niche, niche_detail, goals, platforms")
      .eq("user_id", user.id)
      .maybeSingle();
    brandName = prof?.brand_name ?? null;
    niche = prof?.niche ?? null;
    nicheDetected = Boolean(prof?.niche_detail);
    goal = prof?.goals ?? null;
    platform = (Array.isArray(prof?.platforms) && prof.platforms[0]) || null;
  } catch {
    // profile columns may be mid-migration; the form still works blank
  }

  const snap = await getIgSnapshot(supabase, user.id);
  const media = snap?.media ?? [];
  const engRate =
    snap?.followers_count && media.length
      ? ((avg(media.map(engOf)) / snap.followers_count) * 100).toFixed(1) + "%"
      : null;

  const prefill: GenerateInput = {
    clientHandle: brandName || snap?.name || (snap?.username ? `@${snap.username}` : ""),
    niche: niche ?? "",
    platform: platform || "Instagram",
    brandVoice: "",
    recentPosts: recentLines(media),
    competitors: "",
    goal: goal ?? "",
  };

  const autoNotes: PlanContext["autoNotes"] = {};
  if (prefill.clientHandle)
    autoNotes.clientHandle = brandName ? "From your profile" : "From your connected account";
  if (prefill.niche)
    autoNotes.niche = nicheDetected ? "Detected from your content" : "From your profile";
  if (prefill.goal) autoNotes.goal = "From your profile";
  if (prefill.recentPosts) autoNotes.recentPosts = "From your connected account";

  const context: PlanContext = {
    prefill,
    autoNotes,
    connected: Boolean(snap),
    username: snap?.username ?? null,
    syncedAgo: snap?.last_synced_at ? ago(snap.last_synced_at) : null,
    postsAnalyzed: snap ? media.length : null,
    engRate,
    bestTime: media.length ? bestTime(media) : null,
  };

  return (
    <AppShell active="tool" userEmail={user.email} dark>
      <ContentPlanClient context={context} />
    </AppShell>
  );
}

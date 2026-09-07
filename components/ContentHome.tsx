"use client";

// Content: every synced post in one place, with the detail drawer and Ask
// SOCIA scoped to the post the user is looking at.

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import ContentRow from "./ov/ContentRow";
import ContentDrawer from "./ov/ContentDrawer";
import ContentLibrary, { type LibraryPost } from "./ContentLibrary";
import PageHeader from "./PageHeader";
import { rankPosts, type PostCard } from "@/lib/overview";
import { askSocia } from "@/lib/ask";

export default function ContentHome({ posts, library, baseline, medianViews, handle }: { posts: PostCard[]; library: LibraryPost[]; baseline: number | null; medianViews: number | null; handle: string | null }) {
  const [open, setOpen] = useState<PostCard | null>(null);
  const [view, setView] = useState<"top" | "recent" | "under">("top");
  const row = useMemo(() => {
    if (view === "top") return rankPosts(posts, "views", 12);
    if (view === "under") return posts.filter((p) => p.multiplier != null && p.multiplier < 0.7).sort((a, b) => (a.multiplier ?? 0) - (b.multiplier ?? 0)).slice(0, 12);
    return posts.slice(0, 12);
  }, [posts, view]);
  return (
    <>
      <PageHeader
        title="Content"
        sub={`Every post SOCIA has synced${handle ? ` from @${handle}` : ""}, with the numbers exactly as Instagram returned them.`}
        actions={<button type="button" className="ov-btn ghost" onClick={() => askSocia({ context: { page: "content" } })}><Sparkles size={13} /> Ask SOCIA</button>}
      />
      <section className="ov-card" aria-labelledby="ch-row-h">
        <div className="ov-card-head wrap">
          <h2 id="ch-row-h">{view === "top" ? "Top content" : view === "under" ? "Underperforming" : "Most recent"}</h2>
          <div className="ov-seg" role="tablist" aria-label="View">
            {([["top", "Top"], ["recent", "Recent"], ["under", "Underperforming"]] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? "on" : ""} onClick={() => setView(id)}>{label}</button>
            ))}
          </div>
          <span className="ov-range-label">{baseline != null ? `Median post ${Math.round(baseline).toLocaleString("en-US")} interactions` : "No baseline yet"}</span>
        </div>
        {row.length ? <ContentRow posts={row} onOpen={setOpen} size="lg" /> : <div className="ov-empty small">{view === "under" ? "No post fell below 70% of your median interactions." : "No posts synced yet."}</div>}
      </section>
      <section className="ov-card" id="posts" aria-labelledby="ch-all-h" style={{ marginTop: 14 }}>
        <div className="ov-card-head">
          <h2 id="ch-all-h">All posts</h2>
          <span className="ov-range-label">{library.length} synced · click Why on any row to ask SOCIA about it</span>
        </div>
        <ContentLibrary posts={library} embedded />
      </section>
      <ContentDrawer post={open} baseline={baseline} medianViews={medianViews} onClose={() => setOpen(null)} />
    </>
  );
}

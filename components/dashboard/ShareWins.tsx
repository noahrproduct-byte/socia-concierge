"use client";

// Dashboard: posts that did clearly better than this account's usual post,
// each with an image to save and share (lib/share). Counted on the server
// from the platforms' own numbers; renders nothing when there is no such post.
import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/system";

type Win = { postId: string; title: string; multiple: string; metric: string; platform: string; publishedAt: string | null; image: string };
const PLATFORM: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function ShareWins() {
  const [wins, setWins] = useState<Win[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/share/wins").then((r) => (r.ok ? r.json() : null)).then((j: { wins?: Win[] } | null) => { if (alive && j?.wins) setWins(j.wins); }).catch(() => { /* nothing to show */ });
    return () => { alive = false; };
  }, []);
  if (!wins.length) return null;
  return (
    <Card className="dash-lift">
      <CardHeader title="Posts that beat your usual" period="Last 90 days" />
      <ul className="wins">
        {wins.map((w) => (
          <li key={w.postId}>
            <span className="wins-what">
              <b>{w.multiple} your usual {w.metric}</b>
              <small>{[PLATFORM[w.platform] ?? w.platform, w.publishedAt ? day(w.publishedAt) : null, w.title || null].filter(Boolean).join(", ")}</small>
            </span>
            <a className="s-link" href={w.image} target="_blank" rel="noreferrer">Get the image</a>
          </li>
        ))}
      </ul>
      <p className="mom-note">The image says how the post did against your own usual result. Save it and share it wherever you like.</p>
    </Card>
  );
}

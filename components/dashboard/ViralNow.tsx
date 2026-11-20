"use client";

// "Going viral in your niche" on the Dashboard: the few Reels from the niche
// that took off by their own published numbers (app/api/dashboard/viral,
// the same Reels Discover shows), as thumbnails to watch and to make an
// original version of. Nothing here is generated: thumbnails, names and
// numbers are what the platform returned when SOCIA last read the account;
// a missing number stays missing, and with nothing proven the card says so.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clapperboard, ExternalLink, Play } from "lucide-react";
import { Button, ButtonLink, Card, CardHeader, CardSource, Skeleton } from "@/components/system";
import { PLATFORM, ago, makeLikeReel } from "@/components/competitors/TrendingNiche";
import type { ViralPick, ViralReel } from "@/lib/viralPick";

const fmt = (n: number | null) => (n == null ? null : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n));
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null);

/** Why it took off, in its own numbers: "12× their usual" or "1.2M views". */
function evidence(r: ViralReel): string | null {
  if (r.multiplier != null) return `${r.multiplier >= 10 ? r.multiplier.toFixed(0) : r.multiplier.toFixed(1)}× their usual`;
  return r.views != null ? `${fmt(r.views)} views` : null;
}

function ReelCard({ r, now, onUse }: { r: ViralReel; now: Date; onUse: (r: ViralReel) => void }) {
  const stats = [r.views != null ? `${fmt(r.views)} views` : null, r.likes != null ? `${fmt(r.likes)} likes` : null, r.comments != null ? `${fmt(r.comments)} comments` : null].filter(Boolean).join(" · ");
  const proof = evidence(r);
  const hook = r.line ? `“${r.line}”` : r.title;
  return (
    <article className="dash-vn-card">
      <a className="dash-vn-thumb" href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`Watch the ${r.format} by ${r.accountName} on ${PLATFORM[r.platform] ?? r.platform}`}>
        {r.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="dash-vn-noimg">{r.format}</span>
        )}
        <span className="dash-vn-play" aria-hidden><Play size={16} /></span>
        {proof && <b className="dash-vn-proof">{proof}</b>}
      </a>
      <div className="dash-vn-body">
        <span className="dash-vn-who">
          {r.accountAvatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.accountAvatar} alt="" loading="lazy" referrerPolicy="no-referrer" />
          )}
          <span className="dash-vn-name">{r.accountHandle ? `@${r.accountHandle}` : r.accountName}</span>
          <span className="dash-vn-plat">{PLATFORM[r.platform] ?? r.platform}</span>
        </span>
        {hook && <p className="dash-vn-hook">{hook}</p>}
        <p className="dash-vn-stats">{[stats || null, ago(r.publishedAt, now)].filter(Boolean).join(" · ")}</p>
        <p className="dash-vn-why">
          {r.from === "competitor" ? "A competitor you track." : "An account in your niche."}
          {r.make ? ` Your version: ${r.make}` : null}
        </p>
        <div className="dash-vn-actions">
          <Button size="sm" variant="primary" onClick={() => onUse(r)} title="Opens the video editor with a brief written from this video, and the video as the reference when the platform gives its file. You add your own clips; your version is your own.">
            <Clapperboard size={14} aria-hidden /> Use as inspiration
          </Button>
          <a className="dash-vn-open" href={r.url} target="_blank" rel="noopener noreferrer">
            Watch <ExternalLink size={12} aria-hidden />
          </a>
        </div>
      </div>
    </article>
  );
}

export default function ViralNow() {
  const router = useRouter();
  const [d, setD] = useState<ViralPick | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stop = false;
    fetch("/api/dashboard/viral")
      .then(async (res) => { if (!res.ok) throw new Error(String(res.status)); return (await res.json()) as ViralPick; })
      .then((j) => { if (!stop) setD(j); })
      .catch(() => { if (!stop) setFailed(true); });
    return () => { stop = true; };
  }, []);

  const discover = (
    <ButtonLink href="/discover" variant="ghost" size="sm">
      Explore Discover <ArrowRight size={14} aria-hidden />
    </ButtonLink>
  );
  const now = d ? new Date(d.now) : new Date();

  return (
    <Card className="dash-vn">
      <CardHeader title="Going viral in your niche" actions={discover} />
      <p className="dash-vn-sub">See what&apos;s working right now, and find the idea for your next post.</p>

      {!d && !failed && (
        <div className="dash-vn-row" aria-busy="true" aria-label="Loading videos">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="dash-vn-card">
              <Skeleton variant="block" className="dash-vn-skel" />
              <Skeleton variant="meta" width="60%" />
              <Skeleton variant="text" />
            </div>
          ))}
        </div>
      )}

      {failed && <p className="dash-vn-empty">The videos couldn&apos;t be loaded right now. They&apos;re on Discover too.</p>}

      {d && !d.access && (
        <p className="dash-vn-empty">
          Videos that took off in your niche are part of niche intelligence.{" "}
          {d.upgrade && <a href={d.upgrade}>See the plan that includes it.</a>}
        </p>
      )}

      {d && d.access && d.reels.length === 0 && (
        <p className="dash-vn-empty">
          No video in your niche has taken off yet by its own numbers: more than its account&apos;s usual, or past the views bar.
          Discover shows every video SOCIA has read, and tracking more competitors gives it more to look at.
        </p>
      )}

      {d && d.reels.length > 0 && (
        <div className="dash-vn-row">
          {d.reels.map((r) => <ReelCard key={r.url} r={r} now={now} onUse={(x) => makeLikeReel(x, (href) => router.push(href))} />)}
        </div>
      )}

      {d && d.access && (
        <CardSource>
          {d.readAt ? `Niche last researched ${day(d.readAt)}. ` : null}
          Views, likes and comments are the platform&apos;s, as of SOCIA&apos;s last read of each account; &ldquo;their usual&rdquo; compares a video with that account&apos;s median.
          {d.reels.length > 0 && <> <a href="/discover">See more videos on Discover</a>.</>}
        </CardSource>
      )}
    </Card>
  );
}

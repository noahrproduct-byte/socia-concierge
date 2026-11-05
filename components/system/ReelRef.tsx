// The niche Reel a plan post or a video idea is built on (lib/trendSignals.ts
// ReelRef): who posted it, the numbers the platform published for it and a
// link to it. It is evidence that the idea has worked before for another
// account, and it says so: never a forecast for the person's own post.

import { ExternalLink } from "lucide-react";
import { TREND_WINDOW_DAYS, refResult, trackWord, type ReelRef } from "@/lib/trendSignals";

const PLATFORM: Record<string, string> = { instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", facebook: "Facebook" };

export function ReelRefNote({ r }: { r: ReelRef }) {
  const platform = PLATFORM[r.platform] ?? r.platform;
  const result = refResult(r);
  return (
    <div className="s-reelref">
      <p>
        <b>Researched on {platform}.</b> Built on a Reel that took off in your niche, by {r.account}
        {result ? `: ${result}.` : "."}
        {r.structure ? ` Hook structure: ${r.structure.replace(/ hook$/i, "")}.` : ""}
      </p>
      {r.track && (
        <details className="s-reelref-track">
          <summary>
            <b>Viral track record: {r.track.score} of 100</b> ({trackWord(r.track)}) <span>How this is counted</span>
          </summary>
          <ul>
            {r.track.parts.map((p) => (
              <li key={p.label}>
                <b>{p.label}: {p.points} of {p.max}.</b> {p.basis}
              </li>
            ))}
          </ul>
          <p>
            SOCIA counts this from the Reels it read in your niche over the last {TREND_WINDOW_DAYS} days. It measures how Reels like this one did for other accounts, and nothing in it is a guess.
          </p>
        </details>
      )}
      <p className="s-reelref-foot">
        <a href={r.url} target="_blank" rel="noopener noreferrer" className="s-link">
          Open the Reel <ExternalLink size={12} aria-hidden />
        </a>
        <span>That is their result, as {platform} published it. It shows this has worked before; it is not a forecast for your post.</span>
      </p>
    </div>
  );
}

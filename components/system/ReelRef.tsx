// The niche Reel a plan post or a video idea is built on (lib/trendSignals.ts
// ReelRef): who posted it, the numbers the platform published for it and a
// link to it. It is evidence that the idea has worked before for another
// account, and it says so: never a forecast for the person's own post.

import { ExternalLink } from "lucide-react";
import { refResult, type ReelRef } from "@/lib/trendSignals";

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
      <p className="s-reelref-foot">
        <a href={r.url} target="_blank" rel="noopener noreferrer" className="s-link">
          Open the Reel <ExternalLink size={12} aria-hidden />
        </a>
        <span>That is their result, as {platform} published it. It shows this has worked before; it is not a forecast for your post.</span>
      </p>
    </div>
  );
}

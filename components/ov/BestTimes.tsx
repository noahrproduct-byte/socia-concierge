"use client";

// Compact best-times preview (Dashboard, Analytics overview): the ranked
// windows from lib/postingTimes with their sample sizes, computed in the
// viewer's time zone. The full heatmap lives on the Posting Times tab.

import { useMemo } from "react";
import { buildWindows, type TimedPost } from "@/lib/postingTimes";
import { WindowsList } from "./PostingHeatmap";

export default function BestTimes({ posts }: { posts: TimedPost[] }) {
  const w = useMemo(() => buildWindows(posts), [posts]);
  return <WindowsList w={w} compact />;
}

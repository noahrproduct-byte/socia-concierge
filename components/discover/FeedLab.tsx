"use client";

// Discover's feeds on made-up Reels, for looking at the layout and the adaptation panel without an account or
// the AI. Development only (app/dev/discover-lab). Its answers come from this page: nothing here is real data.
import { useEffect } from "react";
import ReelFeed from "./ReelFeed";
import type { FeedReel, FeedSource } from "@/lib/discoverFeed";

const PICS = ["beans", "cold-brew", "espresso", "iced-latte", "open", "pastry", "pour-over", "regulars", "roast", "storefront"];
const make = (i: number, source: FeedSource, handle: string): FeedReel => ({
  url: `https://www.instagram.com/reel/LAB${i}abcd/`, platform: "instagram", accountName: handle, accountHandle: handle, accountAvatar: null,
  title: ["Three outfits for three moods", "The 6 AM dough nobody sees", "POV: your order is ready before you sit", "What 400 slices a day looks like", "We tried the viral cheese pull"][i % 5],
  thumb: `/landing/cafe/${PICS[i % PICS.length]}.jpg`, publishedAt: new Date(Date.now() - (i % 9) * 86_400_000).toISOString(),
  views: 18000 + i * 7300, likes: 900 + i * 40, comments: 30 + i, multiplier: 1.5 + (i % 7) * 1.7, basis: "views", format: "Reel",
  id: `L${i}`, proven: true, line: null, structures: ["Listicle hook"], topics: ["Behind the scenes"], source,
} as FeedReel);

const SOURCES: FeedSource[] = ["competitor", "niche", "similar", "copy", "related"];
const recommended = Array.from({ length: 20 }, (_, i) => make(i, SOURCES[i % SOURCES.length], `account_${i}`));
const trending = Array.from({ length: 12 }, (_, i) => make(100 + i, "trending", `trend_${i}`));

export default function FeedLab() {
  useEffect(() => {
    const real = window.fetch.bind(window);
    window.fetch = async (url, init) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u.includes("/api/discover/trending")) {
        await new Promise((r) => setTimeout(r, 900));
        return json({ reels: Array.from({ length: 8 }, (_, i) => make(200 + i, "trending", `more_${i}`)), next: null });
      }
      if (u.includes("/api/discover/adapt")) {
        await new Promise((r) => setTimeout(r, 1200));
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const one = (k: number) => ({
          concept: k === 1 ? "Three pizzas for three moods, cut on the beat" : `Version ${k}: three regulars, three orders`,
          hook: "Your mood decides your pizza tonight", keeps: "Three quick options from one camera spot, revealed one after another",
          steps: ["Put the phone on a stand above the counter, pointing straight down.", "Film each pizza for two seconds as it lands on the board.", "Say the mood out loud before each one.", "Film one last shot of all three side by side."],
          shots: ["Top down, close on the board", "Side angle at counter height for the last shot"], editing: "Cut on each beat of the audio; no transitions between pizzas.",
          onScreenText: ["Tired", "Celebrating", "Hungry"], cta: "Which one are you choosing?", durationSec: 15, why: "It keeps the original's fast reveal and curiosity, with your own pizzas.", at: new Date().toISOString(),
        });
        const have = body.have ?? 0;
        return json({ adaptations: Array.from({ length: body.again ? have + 1 : Math.max(1, have) }, (_, k) => one(k + 1)) });
      }
      return real(url, init);
    };
    return () => { window.fetch = real; };
  }, []);
  return (
    <div className="s-page cx cx2 dsc">
      <ReelFeed recommended={recommended} trending={trending} trendingNext={12} adapted={[]} now={new Date().toISOString()} nicheAccess nicheUpgrade={null} emptyWhy="" />
    </div>
  );
}

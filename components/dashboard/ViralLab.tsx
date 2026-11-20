"use client";

// Development only (/dev/viral-lab): the Dashboard's "Going viral in your
// niche" card on fixture Reels (local photos, made-up accounts), with the
// appearance controls, so the card can be checked in light and dark without
// an account. ?state=empty | locked | error | loading shows the other states.
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ViralNow from "./ViralNow";
import { AppearanceMenuRow, AppearanceSetting } from "@/components/AppearanceChoice";
import { Card, CardHeader } from "@/components/system";
import "@/app/(app)/dashboard/dashboard.css";

const reel = (i: number, handle: string, from: "competitor" | "niche", extra: Record<string, unknown>) => ({
  url: `https://www.instagram.com/reel/lab${i}/`, platform: "instagram", accountName: handle, accountHandle: handle, accountAvatar: "/landing/cafe/beans.jpg",
  title: null, thumb: ["/landing/cafe/iced-latte.jpg", "/landing/cafe/espresso.jpg", "/landing/cafe/pastry.jpg", "/landing/cafe/cold-brew.jpg"][i], publishedAt: new Date(Date.now() - (i + 2) * 86_400_000).toISOString(),
  views: null, likes: null, comments: null, multiplier: null, basis: "views", format: "Reel", id: `R${i}`, proven: true, line: null, structures: [], topics: [], from, ...extra,
});

export default function ViralLab() {
  const sp = useSearchParams();
  const state = sp.get("state");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const real = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/dashboard/viral")) {
        if (state === "loading") return new Promise<Response>(() => {});
        if (state === "error") return new Response("{}", { status: 500 });
        const reels = state === "empty" || state === "locked" ? [] : [
          reel(0, "lab.coffee.co", "competitor", { line: "Nobody tells you this about iced lattes", views: 1_240_000, likes: 58_000, comments: 1_200, multiplier: 14.2, make: "Film your own pour from above, then cut to the first sip." }),
          reel(1, "lab.espresso.bar", "competitor", { title: "3 shots, 3 grind sizes, one winner", views: 312_000, likes: 9_800, comments: 410, multiplier: 6.4 }),
          reel(2, "lab.bakehouse", "niche", { line: "The pastry that sells out by 9am", views: 88_500, likes: 3_100, comments: 95, multiplier: 3.8 }),
          reel(3, "lab.coldbrew", "niche", { title: "Cold brew in 60 seconds", views: 41_000, likes: 1_300, comments: 22, multiplier: null }),
        ];
        return new Response(JSON.stringify({ access: state !== "locked", upgrade: state === "locked" ? "/pricing?plan=starter" : null, reels, readAt: new Date(Date.now() - 86_400_000).toISOString(), niche: "coffee", now: new Date().toISOString() }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/profile")) return new Response("{}", { status: 200 });
      return real(input, init);
    };
    setReady(true);
    return () => { window.fetch = real; };
  }, [state]);
  if (!ready) return null;
  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto", display: "grid", gap: 20 }} className="dash-stack">
      <ViralNow />
      <Card>
        <CardHeader title="Appearance" />
        <AppearanceSetting />
        <div style={{ marginTop: 16, maxWidth: 260 }}><AppearanceMenuRow /></div>
      </Card>
    </div>
  );
}

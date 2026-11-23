"use client";

// A filmed post's storyboard with "Draw the storyboard" (Noah, 2026-11-23): the free shot drawings by
// default; on request, an AI-drawn still of each shot, paid in the owner's credits at the price the image
// service quotes, shown before anything is spent. The drawings are saved on the plan
// (app/api/plan/storyboard, lib/storyboardServer.ts).
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlanBeat } from "@/lib/schema";
import { Button } from "@/components/system";
import { Storyboard, type ShotFrame } from "./PostFocus";

type FrameView = { state: "none" | "drawing" | "drawn" | "failed"; url: string | null; error?: string };
type Quote = { shots: number; perShot: number; credits: number; balance: number | null };

const POLL_MS = 4000;
const POLL_FOR_MS = 10 * 60_000;
const n = (v: number) => v.toLocaleString("en-US");

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || "SOCIA hit an error on its side. Try again in a moment.");
  return j;
}

export default function DrawStoryboard({ beats, planId, itemId, niche, canDraw = true }: { beats: PlanBeat[]; planId: string | null; itemId?: string; niche?: string | null; canDraw?: boolean }) {
  const saved = Boolean(planId && itemId);
  const [frames, setFrames] = useState<FrameView[] | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState<"price" | "start" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const since = useRef(0);
  const had = beats.some((b) => b.frame || b.frameJob);

  const load = useCallback(async () => {
    if (!saved) return;
    try {
      const j = await call<{ frames: FrameView[] }>(`/api/plan/storyboard?plan=${encodeURIComponent(planId!)}&item=${encodeURIComponent(itemId!)}`);
      setFrames(j.frames);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [saved, planId, itemId]);

  // A post that has drawings (or drawings under way) reads them when it opens.
  useEffect(() => {
    setFrames(null); setQuote(null); setError(null);
    if (had) { since.current = Date.now(); void load(); }
  }, [planId, itemId, had, load]);

  const drawing = frames?.some((f) => f.state === "drawing") ?? false;
  useEffect(() => {
    if (!drawing || Date.now() - since.current > POLL_FOR_MS) return;
    const t = setTimeout(() => { void load(); }, POLL_MS);
    return () => clearTimeout(t);
  }, [drawing, frames, load]);

  if (!saved) return <Storyboard beats={beats} />;

  const shown: (ShotFrame | null)[] | undefined = frames?.map((f) => (f.state === "drawn" || f.state === "drawing" ? { url: f.url, drawing: f.state === "drawing" } : null));
  const drawn = frames?.filter((f) => f.state === "drawn").length ?? 0;
  const failed = frames?.filter((f) => f.state === "failed") ?? [];
  const left = beats.length - drawn - (frames?.filter((f) => f.state === "drawing").length ?? 0);

  const price = async () => {
    setBusy("price"); setError(null);
    try {
      setQuote(await call<Quote>("/api/plan/storyboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: planId, item: itemId, quote: true }) }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const start = async () => {
    setBusy("start"); setError(null);
    try {
      const j = await call<{ frames: FrameView[] }>("/api/plan/storyboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: planId, item: itemId, niche }) });
      since.current = Date.now();
      setFrames(j.frames); setQuote(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const short = quote && quote.balance != null && quote.balance < quote.credits;
  return (
    <>
      <Storyboard beats={beats} frames={shown} />
      <div className="pl-draw">
        {drawing ? (
          <p role="status">Drawing the shots. Each one appears above when it&apos;s done.</p>
        ) : quote && quote.shots > 0 ? (
          <>
            <p>
              Drawing {quote.shots === 1 ? "1 shot" : `${quote.shots} shots`} costs <b>{n(quote.credits)} credits</b> ({n(quote.perShot)} each).
              {quote.balance != null && <> You have {n(quote.balance)}.</>}
              {short && <> That&apos;s {n(quote.credits - (quote.balance ?? 0))} short, so nothing can be drawn yet.</>}
            </p>
            <span className="pl-draw-actions">
              <Button variant="primary" size="sm" busy={busy === "start"} disabled={Boolean(short) || busy != null} onClick={start}>Draw {quote.shots === 1 ? "it" : `${quote.shots} shots`}</Button>
              <Button variant="ghost" size="sm" disabled={busy === "start"} onClick={() => setQuote(null)}>Cancel</Button>
            </span>
          </>
        ) : left > 0 && canDraw ? (
          <>
            <p>{drawn ? "Some shots aren't drawn yet." : "Want to see each shot? SOCIA can draw it with AI from the words above, paid in credits."}</p>
            <span className="pl-draw-actions">
              <Button size="sm" busy={busy === "price"} disabled={busy != null} onClick={price}>{drawn ? "Draw the rest" : "Draw the storyboard"}</Button>
            </span>
          </>
        ) : drawn > 0 ? (
          <p>Drawn by AI from each shot&apos;s words, to show the idea. Your own footage will look different.</p>
        ) : null}
        {failed.length > 0 && !drawing && <p className="pl-draw-error" role="alert">{failed[0].error}</p>}
        {error && <p className="pl-draw-error" role="alert">{error}</p>}
      </div>
    </>
  );
}

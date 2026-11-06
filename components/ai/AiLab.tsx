"use client";

// Development only: the AI Clipper and AI Studio pages on fixture data, with
// fetch answered in the tab (no account, no provider). /dev/ai-lab?screen=clipper|studio.
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ClipperPage from "./ClipperPage";
import AiStudioPage from "./AiStudioPage";
import "@/app/(app)/ai/ai.css";

const SAMPLE = "/dev-sample.mp4";
// SOCIA's own clipper: a long upload, two moments picked, one not made yet.
const LONG = "/dev-long.mp4";
const said = "So here is the thing nobody tells you about opening a pizza place. The dough is the whole business. If the dough is wrong nothing else matters.".split(" ");
const words = said.map((text, i) => ({ text, startMs: 2000 + i * 420, endMs: 2000 + i * 420 + 380, confidence: null }));
const sociaClips = [
  { id: "s1", title: "The dough is the whole business", score: 8.6, score_reason: "Opens on a claim nobody else makes and pays it off in one line.", duration_ms: 11000, caption: "The dough is the whole business.", hashtags: ["pizza", "smallbusiness"], playUrl: null, downloadUrl: null, transcript: said.join(" "), hook: "So here is the thing nobody tells you", render: { sourceUrl: LONG, startMs: 2000, endMs: 13000, cropX: 0.5, words, captions: true } },
  { id: "s2", title: "If the dough is wrong nothing else matters", score: 7.1, score_reason: "A clear rule, said plainly.", duration_ms: 6000, caption: "If the dough is wrong nothing else matters.", hashtags: ["pizza"], playUrl: null, downloadUrl: null, transcript: said.slice(-9).join(" "), hook: "If the dough is wrong", render: { sourceUrl: LONG, startMs: 8000, endMs: 14000, cropX: 0.5, words: words.slice(-9), captions: true } },
];
const clipJobs = [
  { id: "j0", status: "done", provider: "socia", source_kind: "upload", source_url: "upload", source_minutes: 1, credits_reserved: 17, credits_charged: 17, error: null, created_at: new Date(Date.now() - 600_000).toISOString(), options: { headline: true, captions: true, sourceName: "Opening a pizza place.mp4" } },
  { id: "j1", status: "done", source_kind: "youtube", source_url: "https://www.youtube.com/watch?v=OqLfw-TzzfI", source_minutes: 12, credits_reserved: 90, credits_charged: 90, error: null, created_at: new Date(Date.now() - 3600_000).toISOString(), options: {} },
  { id: "j2", status: "processing", provider: "socia", stage: "transcribing", source_kind: "upload", source_url: "upload", source_minutes: 40, credits_reserved: 300, credits_charged: null, error: null, created_at: new Date(Date.now() - 120_000).toISOString(), options: { sourceName: "Founder interview.mov" } },
  { id: "j3", status: "failed", source_kind: "url", source_url: "https://example.com/talk.mp4", source_minutes: 8, credits_reserved: 60, credits_charged: 0, error: "The video could not be downloaded from that link.", created_at: new Date(Date.now() - 86400_000).toISOString(), options: {} },
];
const clips = [
  { id: "c1", title: "Why the first two seconds decide everything", score: 9.2, score_reason: "Opens on the claim and shows the result before explaining it.", duration_ms: 28400, caption: "The first two seconds decide whether anyone stays. Here is what we changed.", hashtags: ["shortform", "hooks", "smallbusiness"], playUrl: SAMPLE, downloadUrl: SAMPLE, transcript: "" },
  { id: "c2", title: "The one metric we stopped looking at", score: 7.8, score_reason: "A clear opinion, stated early.", duration_ms: 41200, caption: "We stopped chasing likes. This is what we track instead.", hashtags: ["analytics", "creators"], playUrl: SAMPLE, downloadUrl: SAMPLE, transcript: "" },
  { id: "c3", title: "Behind the counter at 6am", score: 6.1, score_reason: "Good atmosphere; the point lands late.", duration_ms: 52000, caption: "6am. Before the first customer, there is this.", hashtags: ["coffee", "behindthescenes"], playUrl: SAMPLE, downloadUrl: SAMPLE, transcript: "" },
];
const genJobs = [
  { id: "g1", status: "done", kind: "text_to_video", model: "hailuo-2.3-standard", prompt: "A slow push in on a ceramic cup on a wooden counter, morning light through a window, steam rising", credits_reserved: 45, credits_charged: 45, error: null, created_at: new Date(Date.now() - 1800_000).toISOString(), idea: { hook: "the quiet before the first order", caption: "Before anyone walks in, there is this." } },
  { id: "g2", status: "processing", kind: "text_to_image", model: "soul-2-standard", prompt: "A flat lay of three pastries on parchment, soft daylight", credits_reserved: 6, credits_charged: null, error: null, created_at: new Date(Date.now() - 60_000).toISOString(), idea: null },
];
const gens = [{ id: "o1", kind: "video", title: "the quiet before the first order", caption: "Before anyone walks in, there is this.", hashtags: ["coffee", "morning"], playUrl: SAMPLE, downloadUrl: SAMPLE, duration_ms: 6000 }];
const ideas = [
  { id: "i1", hook: "the quiet before the first order", concept: "The empty room at opening, for people who only ever see it full.", shot: "A slow push in on a ceramic cup on a wooden counter, morning light through a window, steam rising, no people", kind: "text_to_video", caption: "Before anyone walks in, there is this.", hashtags: ["coffee", "morning"] },
  { id: "i2", hook: "three ways we get it wrong", concept: "A still for a carousel cover about common mistakes.", shot: "Three mismatched cups in a row on a marble surface, overhead, soft shadow", kind: "text_to_image", caption: "Three ways we get it wrong, and the fix for each.", hashtags: ["barista"] },
];

function mock(url: string, init?: RequestInit): Response | null {
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });
  const u = url.replace(/^https?:\/\/[^/]+/, "");
  if (u === "/api/clipper/jobs" && (!init?.method || init.method === "GET")) return json({ jobs: clipJobs, balance: 5550 });
  if (u === "/api/clipper/jobs" && init?.method === "POST") {
    // As the server answers: the measured length (14 min here) is priced first; then the credits.
    const sent = (JSON.parse(String(init.body ?? "{}")) as { minutes?: number }).minutes;
    if (!sent || sent < 14) return json({ error: "This video is 14 minutes long, so clipping it uses 105 credits. Press Make clips again to go ahead.", code: "confirm_price", minutes: 14, price: 105 }, 409);
    return json({ error: "Not enough credits for this. Buy a top-up or wait for next month's allowance.", code: "insufficient_credits", balance: 5550 }, 402);
  }
  const cj = /^\/api\/clipper\/jobs\/([^/?]+)/.exec(u);
  if (cj) return json({ job: clipJobs.find((j) => j.id === cj[1]) ?? clipJobs[0], clips: cj[1] === "j1" ? clips : cj[1] === "j0" ? sociaClips : [] });
  // Making a clip: the upload address goes nowhere in the lab, so the made file's size is kept on window for checking.
  if (/^\/api\/clipper\/clips\/[^/]+$/.test(u) && init?.method === "POST") return json({ path: "lab/clips/x.mp4", signedUrl: "/dev-upload-sink", token: "t" });
  if (u === "/api/studio-ai/jobs" && (!init?.method || init.method === "GET")) return json({ jobs: genJobs, balance: 5550 });
  const gj = /^\/api\/studio-ai\/jobs\/([^/?]+)/.exec(u);
  if (gj) return json({ job: genJobs.find((j) => j.id === gj[1]) ?? genJobs[0], outputs: gj[1] === "g1" ? gens : [] });
  if (u === "/api/studio-ai/ideas") return json({ ideas });
  if (u === "/api/media/to-scheduler") return json({ href: "/create?post=demo" });
  return null;
}

export default function AiLab() {
  const sp = useSearchParams();
  const screen = sp.get("screen") === "studio" ? "studio" : "clipper";
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const real = window.fetch.bind(window);
    window.fetch = async (input, init) => mock(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, init) ?? real(input, init);
    setReady(true);
    return () => { window.fetch = real; };
  }, []);
  if (!ready) return null;
  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }} data-screen={screen}>
      {screen === "clipper" ? (
        <><PageHeader title="AI Clipper" sub="Turn a long video into short clips with captions." /><ClipperPage initialBalance={5550} canMutate sociaReady vizardReady /></>
      ) : (
        <><PageHeader title="AI Studio" sub="Ideas from your brand, made into AI videos and images." /><AiStudioPage initialBalance={5550} canMutate aiReady /></>
      )}
    </div>
  );
}

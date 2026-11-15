// Reading an account's video style (lib/videoStyle.ts): picks the account's
// best and newest Reels and its competitors' Reels made the same way, measures
// each file with ffmpeg (length, cuts, the palette from real pixels, frames
// from inside), then one vision call names the look. Saved on the brand row
// (brand_detail.videoStyle), like the brand read. Server only.
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Ctx } from "./context";
import { brandWorkspace } from "./context";
import { anthropic, FAST_MODEL, effortFor } from "./anthropic";
import { recordAiUsage } from "./aiUsage";
import { getIgSnapshot, type IgMediaItem } from "./instagramSync";
import { listTracked } from "./trackedCompetitors";
import { competitorScopeId, updateWorkspace } from "./workspaces";
import { igCompetitorRows } from "./igCompetitorData";
import { readStyleMemory } from "./discoverStyleLoad";
import { styleKey } from "./discoverStyle";
import { freshDetail, currentDetail } from "./intel/understandLoad";
import { ffmpeg, readableVideo } from "./nicheScan/frames";
import type { BrandDetail } from "./profile";
import { VOICE_READ_RATE, readVoice, voiceKind, type VoiceRead } from "./voiceRead";
import { listVoices, voiceConfigured } from "./voiceover/elevenlabs";
import { FONTS, LOGO_SPOTS, OWN_REELS, COMPETITOR_REELS, OWN_FRAMES, COMPETITOR_FRAMES, averageOf, cleanStyleRead, cutTimes, cutsPer10s, mergePalettes, paletteFromPixels, readSavedStyle, type StyleSource, type Swatch, type VideoStyle } from "./videoStyle";

const MAX_VIDEO_BYTES = 40_000_000;
const STEP_TIMEOUT_MS = 20_000;

type Candidate = { source: StyleSource; video: string; frames: number; own: boolean };
type Measured = { c: Candidate; seconds: number | null; cuts: number | null; palette: Swatch[]; frames: { data: string; at: number }[]; voice: VoiceRead | null };

/** Seconds of a Reel's sound that are listened to. */
const LISTEN_SECONDS = 45;

/** What kind of voice an audio or video file has (lib/voiceRead.ts); null when it has no sound that can be read. */
async function hearFile(bin: string, file: string): Promise<VoiceRead | null> {
  const r = await run(bin, ["-hide_banner", "-loglevel", "error", "-t", String(LISTEN_SECONDS), "-i", file, "-vn", "-ac", "1", "-ar", String(VOICE_READ_RATE), "-f", "f32le", "pipe:1"], "buffer");
  const raw = r?.out as Buffer | undefined;
  if (!raw || raw.length < VOICE_READ_RATE * 4) return null;
  // Copied so the samples start on a 4-byte boundary.
  const samples = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + Math.floor(raw.length / 4) * 4));
  return readVoice(samples, VOICE_READ_RATE);
}

/** The pitch of each voice SOCIA can read a voiceover in, measured from the voice's own sample the same way the Reels are. */
async function stockPitches(bin: string, dir: string): Promise<{ id: string; pitchHz: number }[]> {
  if (!voiceConfigured()) return [];
  const voices = await listVoices().catch(() => []);
  const out = await Promise.all(voices.map(async (v) => {
    try {
      if (!v.preview || !/^https:\/\//.test(v.preview)) return null;
      const res = await fetch(v.preview, { signal: AbortSignal.timeout(STEP_TIMEOUT_MS), redirect: "error" });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > 5_000_000) return null;
      const file = join(dir, `voice-${v.id.replace(/[^a-z0-9]/gi, "_").slice(0, 40)}.mp3`);
      await writeFile(file, buf);
      const heard = await hearFile(bin, file);
      return heard?.pitchHz ? { id: v.id, pitchHz: heard.pitchHz } : null;
    } catch {
      return null;
    }
  }));
  return out.filter((x): x is { id: string; pitchHz: number } => Boolean(x));
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The account's own Reels to read: its best against its own median (animated first when it makes them), then its newest. */
function ownCandidates(media: IgMediaItem[], animatedIds: Set<string>, handle: string): Candidate[] {
  const reels = media.filter((m) => m.id && !m.collab_owner && (m.media_product_type === "REELS" || m.media_type === "VIDEO") && readableVideo(m.media_url));
  const val = (m: IgMediaItem) => m.insights?.views ?? (m.like_count ?? 0) + (m.comments_count ?? 0);
  const usual = median(reels.map(val)) ?? 0;
  const toSource = (m: IgMediaItem): Candidate => ({
    source: { id: m.id!, from: "own", account: `@${handle}`, permalink: m.permalink ?? null, thumb: m.thumbnail_url ?? null, views: m.insights?.views ?? null, multiple: usual > 0 ? Math.round((val(m) / usual) * 10) / 10 : null, seconds: null },
    video: m.media_url!, frames: OWN_FRAMES, own: true,
  });
  const best = [...reels].sort((a, b) => Number(animatedIds.has(b.id!)) - Number(animatedIds.has(a.id!)) || val(b) - val(a)).slice(0, OWN_REELS - 2);
  const out = best.map(toSource);
  for (const m of reels) {
    if (out.length >= OWN_REELS) break;
    if (!out.some((c) => c.source.id === m.id)) out.push(toSource(m));
  }
  return out;
}

/** Competitors' Reels to learn structure from: made the same way as the account's own when that's known, each above its own account's median views. */
async function competitorCandidates(ctx: Ctx, ownStyle: string | null): Promise<Candidate[]> {
  const cwid = await competitorScopeId(ctx.client, ctx.workspace?.id ?? null).catch(() => null);
  const tracked = await listTracked<{ platform: string; handle: string }>(ctx.client, ctx.ownerId, "platform, handle", { byAdded: true, workspaceId: cwid }).catch(() => []);
  const handles = tracked.filter((t) => t.platform === "instagram").map((t) => t.handle).slice(0, 20);
  if (!handles.length) return [];
  const [rows, memory] = await Promise.all([
    igCompetitorRows(ctx.client, ctx.ownerId, handles, false, { max: handles.length, cacheOnly: true }).catch(() => null),
    readStyleMemory(ctx).catch(() => null),
  ]);
  const picks: (Candidate & { score: number; same: boolean })[] = [];
  for (const c of rows?.competitors ?? []) {
    if (!c.found || !c.media?.length) continue;
    const style = memory?.accounts[styleKey("instagram", c.handle)]?.style ?? null;
    const withViews = c.media.filter((p) => p.views != null && p.video && readableVideo(p.video));
    const usual = median(withViews.map((p) => p.views as number));
    for (const p of withViews) {
      const multiple = usual ? (p.views as number) / usual : null;
      if (multiple == null || multiple < 1) continue;
      picks.push({
        source: { id: `${c.handle}:${p.permalink ?? p.timestamp ?? picks.length}`, from: "competitor", account: `@${c.handle}`, permalink: p.permalink, thumb: p.thumbnail, views: p.views ?? null, multiple: Math.round(multiple * 10) / 10, seconds: null },
        video: p.video!, frames: COMPETITOR_FRAMES, own: false, score: multiple, same: Boolean(ownStyle && style === ownStyle),
      });
    }
  }
  // Same-style accounts first, then the Reels that beat their own account by the most; one per account before a second.
  picks.sort((a, b) => Number(b.same) - Number(a.same) || b.score - a.score);
  const out: Candidate[] = [];
  const per = new Map<string, number>();
  for (const round of [1, 2]) {
    for (const p of picks) {
      if (out.length >= COMPETITOR_REELS) break;
      const n = per.get(p.source.account) ?? 0;
      if (n >= round || out.includes(p)) continue;
      per.set(p.source.account, n + 1);
      out.push(p);
    }
  }
  return out;
}

const run = (bin: string, args: string[], encoding: "buffer" | "utf8") =>
  new Promise<{ out: Buffer | string; err: string } | null>((resolve) => {
    execFile(bin, args, { encoding, timeout: STEP_TIMEOUT_MS, maxBuffer: 30_000_000 }, (error, stdout, stderr) => {
      resolve({ out: stdout as Buffer | string, err: String(stderr ?? "") + (error && !stdout ? String(error.message) : "") });
    });
  });

/** One Reel's file: its length, its cuts, its colours (own Reels only) and frames from inside it. */
async function measure(bin: string, c: Candidate, dir: string): Promise<Measured | null> {
  const url = readableVideo(c.video);
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(STEP_TIMEOUT_MS), redirect: "error" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_VIDEO_BYTES) return null;
    const file = join(dir, `${c.source.id.replace(/[^a-z0-9]/gi, "_").slice(0, 60)}.mp4`);
    await writeFile(file, buf);
    // Length and cuts in one pass: ffmpeg prints the duration, and the scene filter logs each cut.
    const scan = await run(bin, ["-hide_banner", "-i", file, "-an", "-vf", "select='gt(scene,0.3)',showinfo", "-f", "null", "-"], "utf8");
    const d = scan?.err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const seconds = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null;
    const cuts = scan ? cutTimes(scan.err).length : null;
    const len = seconds && seconds > 0 ? seconds : 10;
    const times = Array.from({ length: c.frames }, (_, i) => Math.round(((i + 0.5) * Math.min(len, 15)) / c.frames * 10) / 10);
    const frames = (await Promise.all(times.map(async (t) => {
      const r = await run(bin, ["-hide_banner", "-loglevel", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=432:-2", "-q:v", "6", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"], "buffer");
      const b = r?.out as Buffer | undefined;
      return b && b.length > 0 && b.length < 700_000 ? { data: b.toString("base64"), at: t } : null;
    }))).filter((f): f is { data: string; at: number } => Boolean(f));
    let palette: Swatch[] = [];
    if (c.own) {
      const p = await run(bin, ["-hide_banner", "-loglevel", "error", "-i", file, "-vf", "fps=1/2,scale=108:192:flags=neighbor", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], "buffer");
      const raw = p?.out as Buffer | undefined;
      if (raw && raw.length) palette = paletteFromPixels(new Uint8Array(raw));
    }
    const voice = await hearFile(bin, file).catch(() => null);
    return { c, seconds: seconds ? Math.round(seconds * 10) / 10 : null, cuts, palette, frames, voice };
  } catch {
    return null;
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["identity", "structure", "limitations"],
  properties: {
    identity: {
      type: "object", additionalProperties: false,
      required: ["background", "text", "accent", "key", "font", "type", "logo", "characters", "stage", "formats"],
      properties: {
        background: { type: "string" }, text: { type: "string" }, accent: { type: "string" }, key: { type: "string" },
        font: { type: "string", enum: [...FONTS] },
        type: { type: "string" },
        logo: { type: "object", additionalProperties: false, required: ["spot", "what"], properties: { spot: { type: "string", enum: [...LOGO_SPOTS] }, what: { type: "string" } } },
        characters: { type: "string" }, stage: { type: "string" },
        formats: {
          type: "array",
          items: { type: "object", additionalProperties: false, required: ["name", "made", "look", "spine", "reels"], properties: { name: { type: "string" }, made: { type: "string", enum: ["animated", "filmed", "screen", "photo", "text", "mixed"] }, look: { type: "string" }, spine: { type: "string" }, reels: { type: "array", items: { type: "string" } } } },
        },
      },
    },
    structure: {
      type: "object", additionalProperties: false, required: ["hooks", "pacing", "spines", "endings"],
      properties: { hooks: { type: "array", items: { type: "string" } }, pacing: { type: "string" }, spines: { type: "array", items: { type: "string" } }, endings: { type: "array", items: { type: "string" } } },
    },
    limitations: { type: "array", items: { type: "string" } },
  },
} as const;

const SYSTEM = `You describe how one social media account's videos look, so new videos can be made that look like that account made them. You get frames from inside the account's own Reels ("own"), with the colours measured from their pixels, and frames from its competitors' Reels ("competitor"). You never invent.

identity comes ONLY from the own Reels:
- background, text, accent, key: hex colours, each one of the measured palette. text is the colour of the main words; key is the colour its key words and highlights are set in (often a gold, a yellow or a brand colour); accent is its second colour, used for results and buttons.
- font: the closest type family: sans, condensed (tall narrow bold letters), serif, rounded, mono, handwritten.
- type: one or two sentences on how the words look: weight, case, size, where they sit, how a key word is set apart, how words appear.
- logo: where the account's logo sits in the frame ("none" when there isn't one) and what it looks like.
- characters: the recurring characters or illustration style, concretely (for example "a white stick-figure climber with round joints"); "" when there are none.
- stage: the fixed frame the videos are built on (for example "a navy indoor climbing wall with scattered colourful holds and a grey mat at the bottom"); "" when there isn't one.
- formats: the 1 to 4 kinds of video the account repeats, each seen in at least two own Reels: name, how it's made, look (what is on screen), spine (what carries it: a counter, a comparison, rounds, a progress bar, a short story; "" when nothing does) and the ids of its own Reels.

structure comes ONLY from the competitor Reels, and only how they are built, never their brand, characters, artwork or words:
- hooks: how the first second grabs attention (a mechanic, not a quote).
- pacing: how long shots last and how text appears.
- spines: what carries those videos.
- endings: how they end (a question, a call to comment, a loop).

limitations: what you could not tell. Plain words, sentence case, no em dashes.`;

/**
 * Read the account's video style and save it. Null when there aren't enough of
 * the account's own Reels to read (two or more with a readable video file).
 */
export async function readVideoStyle(ctx: Ctx, opts: { now?: Date; fresh?: boolean } = {}): Promise<{ style: VideoStyle | null; reason?: string }> {
  const now = opts.now ?? new Date();
  const bin = await ffmpeg();
  if (!bin) return { style: null, reason: "SOCIA can't read video files right now. Try again later." };
  const snap = await getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => null);
  if (!snap?.media?.length || !snap.username) return { style: null, reason: "Connect Instagram so SOCIA can read your Reels." };
  const detail = await currentDetail(ctx).catch(() => ({}) as BrandDetail);
  const animatedIds = new Set((detail.growth?.understanding?.visual?.formats ?? []).filter((f) => f.made === "animated").flatMap((f) => f.ids));
  const memory = await readStyleMemory(ctx).catch(() => null);
  const ownStyle = memory?.own?.style ?? (animatedIds.size ? "animated" : null);
  const own = ownCandidates(snap.media, animatedIds, snap.username);
  if (own.length < 2) return { style: null, reason: "SOCIA needs at least two of your Reels to read your style." };
  const comp = await competitorCandidates(ctx, ownStyle && ownStyle !== "mixed" ? ownStyle : null);

  const dir = await mkdtemp(join(tmpdir(), "vstyle-"));
  let measured: (Measured | null)[] = [];
  let stock: { id: string; pitchHz: number }[] = [];
  try {
    [measured, stock] = await Promise.all([pool([...own, ...comp], 4, (c) => measure(bin, c, dir)), stockPitches(bin, dir)]);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  const ok = measured.filter((m): m is Measured => Boolean(m && m.frames.length));
  const ownOk = ok.filter((m) => m.c.own);
  if (ownOk.length < 2) return { style: null, reason: "SOCIA couldn't open enough of your Reels to read your style. Try again in a minute." };
  const compOk = ok.filter((m) => !m.c.own);
  const palette = mergePalettes(ownOk.map((m) => m.palette));
  const sources = ok.map((m) => ({ ...m.c.source, seconds: m.seconds }));

  const content: unknown[] = [{ type: "text", text: `Account: @${snap.username}\nBio: ${snap.biography?.trim() || "(none)"}\nMeasured palette of its own Reels (share of frame): ${palette.map((s) => `${s.hex} ${Math.round(s.share * 100)}%`).join(", ")}` }];
  for (const m of ok) {
    content.push({ type: "text", text: `${m.c.own ? "own" : "competitor"} Reel ${m.c.source.id}${m.seconds ? `, ${m.seconds} s` : ""}${m.cuts != null ? `, ${m.cuts} cuts` : ""}${m.c.source.multiple != null ? `, ${m.c.source.multiple}x its account's usual views` : ""}:` });
    for (const f of m.frames) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.data } });
  }
  const res = await anthropic.messages.create({
    model: FAST_MODEL, max_tokens: 4000, system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA }, ...effortFor(FAST_MODEL, "medium") },
    messages: [{ role: "user", content }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  recordAiUsage(ctx.ownerId, "video_style", res);
  const block = res.content.find((b: { type: string }) => b.type === "text");
  const text = block && "text" in block ? (block as { text: string }).text : "";
  let raw: unknown = null;
  try { raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { raw = null; }
  if (!raw) return { style: null, reason: "SOCIA's read came back unreadable. Try again." };
  const fresh = cleanStyleRead(raw, {
    sources, palette, now,
    own: { seconds: averageOf(ownOk.map((m) => m.seconds)), cutsPer10s: averageOf(ownOk.map((m) => cutsPer10s(m.cuts ?? 0, m.seconds))) },
    competitors: { seconds: averageOf(compOk.map((m) => m.seconds)), cutsPer10s: averageOf(compOk.map((m) => cutsPer10s(m.cuts ?? 0, m.seconds))) },
  });
  // What the Reels sound like: counted from the audio, like the lengths and cuts above.
  fresh.measured.voice = { own: voiceKind(ownOk.map((m) => m.voice)), competitors: voiceKind(compOk.map((m) => m.voice)), stock };
  // What the person corrected stays theirs on a weekly re-read; "Read again" from Settings starts fresh.
  const prev = readSavedStyle((detail as { videoStyle?: unknown }).videoStyle);
  const style = prev?.confirmed_at && !opts.fresh ? { ...fresh, identity: prev.identity, confirmed_at: prev.confirmed_at } : fresh;
  if (!(await saveVideoStyle(ctx, style))) return { style: null, reason: "Couldn't save your style. Try again." };
  return { style };
}

/** Save the style on the brand's own row. */
export async function saveVideoStyle(ctx: Ctx, style: VideoStyle): Promise<boolean> {
  try {
    const detail = await freshDetail(ctx);
    const next = { ...detail, videoStyle: style } as BrandDetail;
    const ws = brandWorkspace(ctx);
    if (ws) return await updateWorkspace(ctx.client, ctx.ownerId, ws.id, { brand_detail: next });
    const { error } = await ctx.client.from("profiles").upsert({ user_id: ctx.ownerId, brand_detail: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    return !error;
  } catch {
    return false;
  }
}

export async function savedVideoStyle(ctx: Ctx): Promise<VideoStyle | null> {
  const d = await currentDetail(ctx).catch(() => null);
  return readSavedStyle((d as { videoStyle?: unknown } | null)?.videoStyle);
}

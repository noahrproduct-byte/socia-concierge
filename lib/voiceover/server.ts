// Voiceovers, server side: the script (one model call over the cut's own shot
// notes, the brief and the brand's facts, bounded by lib/studioClips/voiceover.ts),
// each line voiced by ElevenLabs and stored privately beside the project's
// clips, and the whole saved on the cut. Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, modelFor, effortFor } from "@/lib/anthropic";
import { recordAiUsage, recordVoice } from "@/lib/aiUsage";
import { brandContext } from "@/lib/prompt";
import { scopeToWorkspace } from "@/lib/workspaces";
import { clipRows, loadBuildRow } from "@/lib/studioClips/server";
import type { AccountContext } from "@/lib/studioClips/analysis";
import { signUrls, storageClient } from "@/lib/studioClips/storage";
import { edlDurationSec } from "@/lib/studioClips/edl";
import { timeline } from "@/lib/studioClips/timeline";
import { STUDIO_BUCKET, type Edl, type Voiceover, type VoiceLine } from "@/lib/studioClips/types";
import {
  alignmentToWords, cleanLine, fitScript, linesToVoice, needsVoiceover, pickDefaultVoice, placeLines,
  SCRIPT_SCHEMA, speakingEndSec, voicePath, wordBudget, MAX_LINES, type VoiceChoice, type VoiceNeed,
} from "@/lib/studioClips/voiceover";
import { listVoices, speakLine, VoiceError } from "./elevenlabs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

const SYSTEM = `You write the voiceover for one short vertical video (a Reel, TikTok or Short). Nobody talks in the footage, so your words are the only voice.
Rules you never break:
- Say only what the shots show, what the brand facts state, or what the person's prompt says. Never invent a price, a number, a time, a place, an ingredient, a review, an award or a promise. When you don't know something, leave it out.
- Spoken English, the way a person talks to a friend: short sentences, plain words. No hashtags, emojis, stage directions, sound effects or quotation marks. No em dashes.
- The first line starts at 0 on the opening shot and tells the viewer what they're watching and why to stay. Then one line for each beat that matters, starting when its shot starts. The last line closes: the place or an invitation to come or try it, only from the brand facts, never a price or a discount.
- Fit the time: about 2.6 words a second, each line finished before the next one starts, with a breath between. Leave quiet stretches where the footage speaks for itself.
- Don't read out the on-screen text word for word; the voice adds to it.`;

/** The words of every clip the cut uses, for the need decision. */
async function cutWords(client: Supa, projectId: string) {
  const rows = await clipRows(client, projectId);
  return Object.fromEntries(rows.map((r) => [r.id, r.transcript?.words ?? null]));
}

/** Whether this cut wants a voice, from its own speech and brief. */
export async function voiceNeedFor(client: Supa, edl: Edl, projectId: string): Promise<VoiceNeed> {
  return needsVoiceover(edl, await cutWords(client, projectId), edl.brief?.prompt ?? null, edl.brief?.voiceover?.on === true);
}

/** The model's script for the cut, fitted to its shots. */
export async function writeScript(edl: Edl, acct: AccountContext, ownerId: string, notes?: string | null): Promise<VoiceLine[]> {
  // What the person wrote the voiceover should say, from the editor or from when they made it.
  const said = (notes ?? edl.brief?.voiceover?.notes ?? "").trim();
  const total = edlDurationSec(edl);
  const speakEnd = speakingEndSec(edl, total);
  const shots = timeline(edl).segments.map((s, i) => `Shot ${i + 1}, ${s.startSec.toFixed(1)}s to ${(s.startSec + s.durationFrames / 30).toFixed(1)}s${s.purpose ? ` (${s.purpose})` : ""}: ${s.note || "no note"}`);
  const onScreen = edl.text.filter((t) => t.text.trim()).map((t) => `"${t.text.replace(/\n/g, " ")}" from ${t.at}s`);
  const brand = brandContext(acct.brand);
  const model = modelFor("fast");
  const res = await anthropic.messages.create({
    model, max_tokens: 900, system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCRIPT_SCHEMA }, ...effortFor(model) },
    messages: [{ role: "user", content: `The video runs ${total.toFixed(1)} seconds.${speakEnd < total ? ` The ending card comes in at ${speakEnd.toFixed(1)}s: every line is finished by then, and the last one is a whole sentence.` : ""} Room for at most ${wordBudget(speakEnd)} words in all, at most ${MAX_LINES} lines.
${acct.niche ? `The account's niche: ${acct.niche}.` : ""}
${brand ? `Brand facts:\n${brand}` : "No brand facts are set: name no place, product or offer the shots don't show."}
${edl.brief?.prompt ? `The person's prompt: ${edl.brief.prompt}` : ""}
${said ? `What the owner wants the voiceover to say (their own words and facts about their business; build the script on these, keep their facts exactly, and add no fact beyond these, the brand facts and the shots):\n${said}` : ""}
${onScreen.length ? `On-screen text: ${onScreen.join("; ")}` : ""}
The shots, in order on the video's own timeline:
${shots.join("\n")}

Write the lines, each with "at" in seconds on the video's timeline.` }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  recordAiUsage(ownerId, "voiceover_script", res);
  const block = res.content.find((b) => b.type === "text");
  const text = block && "text" in block ? block.text : "";
  let raw: unknown = null;
  try { raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { raw = null; }
  const lines = fitScript(raw, speakEnd);
  if (!lines.length) throw new Error("SOCIA couldn't write a voiceover for this cut just now. Try again.");
  return lines;
}

/** Up to `n` at a time. */
async function inBatches<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map((x, j) => fn(x, i + j)))));
  return out;
}

/**
 * Voices every line whose words or voice changed and stores its audio. The
 * characters sent are counted toward the owner's AI ceiling as they are made,
 * so a failure part way through still counts what was really spent.
 */
export async function voiceLines(client: Supa, args: { ownerId: string; projectId: string; buildId: string; vo: Voiceover }): Promise<{ vo: Voiceover; chars: number }> {
  const { ownerId, projectId, buildId, vo } = args;
  const todo = new Set(linesToVoice(vo).map((l) => l.id));
  if (!todo.size) return { vo, chars: 0 };
  const st = storageClient(client).storage.from(STUDIO_BUCKET);
  let chars = 0;
  const stale: string[] = [];
  const lines = await inBatches(vo.lines, 3, async (l, i) => {
    if (!todo.has(l.id)) return l;
    const { audio, alignment } = await speakLine({ text: l.text, voiceId: vo.voiceId, previous: vo.lines[i - 1]?.text, next: vo.lines[i + 1]?.text, signal: AbortSignal.timeout(60_000) });
    chars += l.text.length;
    recordVoice(ownerId, l.text.length);
    const words = alignmentToWords(alignment);
    const path = voicePath(ownerId, projectId, buildId, l, vo.voiceId);
    const { error } = await st.upload(path, new Blob([audio as BlobPart], { type: "audio/mpeg" }), { contentType: "audio/mpeg", upsert: true });
    if (error) throw error;
    if (l.path && l.path !== path) stale.push(l.path);
    const dur = Math.max(words.length ? words[words.length - 1].end : 0, alignment?.character_end_times_seconds?.at(-1) ?? 0);
    return { ...l, path, words, dur: Math.round(dur * 100) / 100, voiced: { text: l.text, voiceId: vo.voiceId } };
  });
  // The audio a line no longer uses: best effort, the cut plays either way.
  if (stale.length) await st.remove(stale).catch(() => null);
  return { vo: { ...vo, lines }, chars };
}

export async function signVoice(client: Supa, vo: Voiceover | null | undefined): Promise<Record<string, string>> {
  const paths = (vo?.lines ?? []).map((l) => l.path).filter((p): p is string => Boolean(p));
  return paths.length ? signUrls(client, paths) : {};
}

export type MakeArgs = {
  ownerId: string; wsId: string | null; buildId: string; acct: AccountContext;
  /** a voice from the list; absent = the cut's current voice, or the one that suits its style */
  voiceId?: string | null;
  /** write a new script even if the cut has one */
  rewrite?: boolean;
  /** the person's own words for some lines, by line id */
  edits?: { id: string; text: string }[];
  /** the person's notes on what the voiceover should say (the editor's Write a voiceover) */
  notes?: string | null;
  /** SOCIA adding it on its own: the cut is stamped so it's tried once */
  auto?: boolean;
  why?: string;
};

export type MakeResult = { voiceover: Voiceover; urls: Record<string, string>; made: boolean; overrunSec: number; voices: VoiceChoice[] };

/** Writes (when needed) and voices the cut's voiceover, and saves it on the cut. */
export async function makeVoiceover(client: Supa, args: MakeArgs): Promise<MakeResult> {
  const { ownerId, wsId, buildId } = args;
  const row = await loadBuildRow(client, ownerId, wsId, buildId);
  if (!row?.edl) throw new Error("That cut does not exist.");
  const edl = row.edl;
  const total = edlDurationSec(edl);
  const voices = await listVoices();
  if (!voices.length) throw new VoiceError("not_configured", "No voices are available in SOCIA right now. Nothing was counted.");
  const cur = edl.voiceover;
  const chosen = voices.find((v) => v.id === args.voiceId)
    ?? (cur ? voices.find((v) => v.id === cur.voiceId) ?? { id: cur.voiceId, name: cur.voiceName, description: "", preview: null } : null)
    ?? pickDefaultVoice(voices, edl.editStyle)!;

  let lines: VoiceLine[];
  if (!cur || args.rewrite) lines = await writeScript(edl, args.acct, ownerId, args.notes);
  else {
    const edits = new Map((args.edits ?? []).map((e) => [e.id, cleanLine(String(e.text ?? "")).slice(0, 400)]));
    lines = cur.lines.map((l) => (edits.has(l.id) && edits.get(l.id) ? { ...l, text: edits.get(l.id)! } : l));
  }
  const base: Voiceover = { on: true, voiceId: chosen.id, voiceName: chosen.name, volume: cur?.volume ?? 1, lines, ...(args.why ? { why: args.why } : cur?.why ? { why: cur.why } : {}) };
  const { vo, chars } = await voiceLines(client, { ownerId, projectId: row.project_id, buildId, vo: base });
  const placed = placeLines(vo.lines, total);
  const voiceover: Voiceover = { ...vo, lines: placed.lines };

  // The voicing takes a while and the person may have changed the cut meanwhile: save into the cut as it is now.
  const fresh = (await loadBuildRow(client, ownerId, wsId, buildId))?.edl ?? edl;
  const next: Edl = { ...fresh, voiceover, ...(args.auto ? { voiceAuto: fresh.voiceAuto ?? new Date().toISOString() } : {}) };
  // A first voiceover turns captions on so the words can be read; the person can turn them off.
  if (!cur && !fresh.captions) next.captions = { source: "transcript" };
  const { error } = await scopeToWorkspace(client.from("studio_builds").update({ edl: next, updated_at: new Date().toISOString() }).eq("id", buildId).eq("user_id", ownerId), wsId);
  if (error) throw error;
  return { voiceover, urls: await signVoice(client, voiceover), made: chars > 0, overrunSec: placed.overrunSec, voices };
}

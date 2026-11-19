import { NextResponse } from "next/server";
import { AI_UNAVAILABLE_COPY } from "@/lib/aiStatus";
import { aiFailure } from "@/lib/anthropic";
import { perUserLimit } from "@/lib/rateLimit";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { buildPlayerData } from "@/lib/studioClips/server";
import { effectAt, sceneSpans, tokens, withPictures } from "@/lib/studioClips/scenes";
import { MAX_EFFECTS, isSceneFx } from "@/lib/studioClips/sceneFx";
import { picturesFor } from "@/lib/studioClips/visualsModel";
import type { Edl } from "@/lib/studioClips/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST { edl, prompt?, wanted? } -> { scenes, pictures, effects }
// Picture graphics for a cut: the words kept in the cut the editor sends (its
// working copy) and what the person asked for go to the model, which picks
// the moments worth a picture and draws them (lib/studioClips/visualsModel.ts).
// The answer is the cut's scenes with the pictures in; nothing is written
// here, the editor saves it with the cut. Capped per user per hour.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { edl?: Edl; prompt?: string; wanted?: unknown } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 1200) : "";
  if (!body?.edl || !Array.isArray(body.edl.segments)) return NextResponse.json({ error: "Send the cut to make pictures for." }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  const limited = await perUserLimit(ctx.ownerId, "studio_visuals", 30, "picture graphics");
  if (limited) return limited;
  try {
    const data = await buildPlayerData(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id, true);
    if (!data) return NextResponse.json({ error: "That build does not exist." }, { status: 404 });
    const known = new Set(data.sources.map((s) => s.clipId));
    if (!body.edl.segments.every((s) => known.has(s.clipId))) return NextResponse.json({ error: "That cut uses footage that is no longer in this project. Reload the editor." }, { status: 409 });
    const words = Object.fromEntries(data.sources.map((s) => [s.clipId, s.words]));
    const said = tokens(body.edl, words).map((t) => ({ text: t.text, key: t.key, sec: t.startMs / 1000 }));
    if (!said.length) return NextResponse.json({ scenes: body.edl.scenes ?? [], pictures: 0, effects: 0 });
    const wanted = (Array.isArray(body.wanted) ? body.wanted : []).filter(isSceneFx).filter((v, i, a) => a.indexOf(v) === i).slice(0, MAX_EFFECTS);
    const pictures = await picturesFor(said, prompt, ctx.ownerId, wanted);
    let scenes = pictures.length ? withPictures(body.edl, pictures, words) : body.edl.scenes ?? [];
    // An effect the person picked is always used: where the model left one out, it goes on the first
    // free moment of the video, with its words from what is said there.
    const total = said[said.length - 1].sec;
    for (const fx of wanted) {
      if (scenes.some((s) => s.kind === "effect" && s.fx === fx)) continue;
      for (const share of [0.08, 0.36, 0.6, 0.8, 0.22, 0.48]) {
        const made = effectAt(body.edl, words, fx, total * share);
        if (!made) break;
        const [mine] = sceneSpans({ ...body.edl, scenes: [made] }, words);
        const busy = sceneSpans({ ...body.edl, scenes }, words);
        if (!mine || busy.some((o) => o.from < mine.from + mine.durationInFrames + 30 && mine.from < o.from + o.durationInFrames + 30)) continue;
        scenes = [...scenes, { ...made, id: `w${scenes.length + 1}` }];
        break;
      }
    }
    return NextResponse.json({ scenes, pictures: scenes.filter((s) => s.kind === "picture").length, effects: scenes.filter((s) => s.kind === "effect").length });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    const kind = aiFailure("studio/builds/visuals", e);
    if (kind !== "failed") return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: 503 });
    console.error("[studio] visuals:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The pictures couldn't be made this time." }, { status: 500 });
  }
}

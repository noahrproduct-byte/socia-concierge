"use client";

// AI Studio: SOCIA works out what is worth making before anything is made.
// 1 Ideate: pick what you want (more views, more customers, more like your
//   best posts, a trending Reel made yours, or a stronger version of your own
//   idea); SOCIA reads the brand profile and, by goal, your best posts or the
//   niche's trending Reels, and writes ideas (lib/generation/goals.ts).
// 2 Develop: the chosen idea becomes an editable creative brief: hook, beats,
//   call to action, length, on-screen text, script, a filming guide and the
//   generator prompt (lib/generation/brief.ts). No media credits spent yet.
// 3 Create: with AI (the prompt prepared from the brief, the recommended model,
//   the price shown first; the model and prompt sit under Advanced) or film it
//   yourself (checklist, shot-by-shot guide, script, into the video editor).
// Ideas and briefs are kept for the session, so moving around never asks twice.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ExternalLink, Film, Lightbulb, Loader2, NotebookPen } from "lucide-react";
import { DEFAULT_MODEL, GENERATION_MODELS, durationsFor, modelById, planAllowsModel, shotsLeft, type GenerationKind } from "@/lib/credits/config";
import type { PlanId } from "@/lib/plans";
import { STUDIO_GOALS, type StudioGoal } from "@/lib/generation/goals";
import { BRIEF_FORMAT, promptFromBrief, type CreativeBrief } from "@/lib/generation/briefCore";
import { handFiles } from "@/lib/studioClips/handoff";
import { ConfirmDialog, SegmentedControl } from "@/components/system";
import { api, errorText, usePolling, uploadToSigned, CreditsLine, StatusChip, MediaCard } from "./shared";

type Idea = { id: string; hook: string; concept: string; shot: string; kind: GenerationKind; caption: string; hashtags: string[]; why?: string; ref?: { url: string; account: string; result: string | null } };
type Job = { id: string; status: "queued" | "processing" | "done" | "failed" | "cancelled"; kind: GenerationKind; model: string; prompt: string; credits_reserved: number; credits_charged: number | null; error: string | null; created_at: string; idea: Idea | null };
type Output = { id: string; kind: "video" | "image"; title: string | null; caption: string | null; hashtags: string[]; playUrl: string | null; downloadUrl: string | null; duration_ms: number | null };
type Path = "ai" | "film";

const KIND_LABEL: Record<GenerationKind, string> = { text_to_video: "Text to video", image_to_video: "Image to video", text_to_image: "Text to image" };
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const MODEL_WHY: Record<string, string> = {
  "kling-3.0-standard": "the best value for video, good on people and motion",
  "soul-2-standard": "sharp stills for covers and carousels",
};
const SAVE_KEY = "socia-ai-studio-v2";

type Saved = { goal: StudioGoal; about: string; draft: string; ideas: Idea[]; used: string | null; missing: string | null; ideaId: string | null; briefs: Record<string, CreativeBrief>; path: Path };

/** The brief as one block of text: the video editor's prompt, and what "Copy" copies. */
function briefText(b: CreativeBrief): string {
  return [
    `Hook: ${b.hook}`, `Concept: ${b.concept}`,
    `Opening shot: ${b.openingShot}`, `Build-up: ${b.buildUp}`, `Payoff: ${b.payoff}`, `Call to action: ${b.cta}`,
    `Format: ${BRIEF_FORMAT}, about ${b.durationSec} seconds`,
    b.onScreenText.length ? `On-screen text: ${b.onScreenText.map((t) => `"${t}"`).join(", then ")}` : null,
    b.script ? `Script: ${b.script}` : null,
    b.shots.length ? `Shots:\n${b.shots.map((s, i) => `${i + 1}. ${s.shot} (${s.seconds} s). ${s.how}`).join("\n")}` : null,
  ].filter(Boolean).join("\n");
}

export default function AiStudioPage({ initialBalance, canMutate, aiReady, plan }: { initialBalance: number | null; canMutate: boolean; aiReady: boolean; plan: PlanId | null }) {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(initialBalance);

  // ---- 1 Ideate ----
  const [goal, setGoal] = useState<StudioGoal>("ideas");
  const [about, setAbout] = useState("");
  const [draft, setDraft] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [used, setUsed] = useState<string | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [ideaErr, setIdeaErr] = useState<string | null>(null);

  // ---- 2 Develop ----
  const [ideaId, setIdeaId] = useState<string | null>(null);
  const [briefs, setBriefs] = useState<Record<string, CreativeBrief>>({});
  const [briefing, setBriefing] = useState(false);
  const [briefErr, setBriefErr] = useState<string | null>(null);
  const idea = ideas.find((i) => i.id === ideaId) ?? null;
  const brief = ideaId ? briefs[ideaId] ?? null : null;

  // ---- 3 Create ----
  const [path, setPath] = useState<Path>("ai");
  const [kind, setKind] = useState<GenerationKind>("text_to_video");
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL.text_to_video);
  const [prompt, setPrompt] = useState("");
  // The person edited the prompt by hand: edits to the brief no longer overwrite it.
  const [promptOwn, setPromptOwn] = useState(false);
  const [duration, setDuration] = useState<number>(5);
  const [aspect, setAspect] = useState<string>("9:16");
  const [image, setImage] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  // Writing the prompt by hand, without an idea: the old one-form AI Studio.
  const [freeform, setFreeform] = useState(false);

  // The generation that waits for "Remove" in the dialog; a failed delete keeps it open and says why.
  const [removing, setRemoving] = useState<Job | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeErr, setRemoveErr] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [outputs, setOutputs] = useState<Record<string, Output[]>>({});
  const [loading, setLoading] = useState(true);

  // ---- the session's work, kept so moving between pages never asks SOCIA twice ----
  // Saving starts only after the kept work is back (a state, so the first save already holds it).
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(SAVE_KEY) ?? "null") as Saved | null;
      if (s) {
        setGoal(s.goal); setAbout(s.about); setDraft(s.draft); setIdeas(s.ideas ?? []); setUsed(s.used); setMissing(s.missing);
        setBriefs(s.briefs ?? {}); setPath(s.path ?? "ai");
        if (s.ideaId && s.briefs?.[s.ideaId]) applyBrief(s.briefs[s.ideaId], (s.ideas ?? []).find((i) => i.id === s.ideaId) ?? null);
        setIdeaId(s.ideaId);
      }
    } catch { /* nothing kept, or storage blocked */ }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!restored) return;
    try { sessionStorage.setItem(SAVE_KEY, JSON.stringify({ goal, about, draft, ideas, used, missing, ideaId, briefs, path } satisfies Saved)); } catch { /* storage full or blocked */ }
  }, [restored, goal, about, draft, ideas, used, missing, ideaId, briefs, path]);

  const models = useMemo(() => GENERATION_MODELS.filter((m) => m.kinds.includes(kind)), [kind]);
  const model = modelById(modelId) ?? models[0];
  useEffect(() => { if (!model || !model.kinds.includes(kind) || !planAllowsModel(plan, model)) setModelId(DEFAULT_MODEL[kind]); }, [kind, model, plan]);
  const lengths = useMemo(() => (model ? durationsFor(plan, model) : []), [model, plan]);
  useEffect(() => { if (lengths.length && !lengths.includes(duration)) setDuration(lengths[0]); }, [lengths, duration]);
  // Image to video takes its shape from the start image.
  const shapes = kind === "image_to_video" ? [] : (model?.aspectRatios ?? []);
  const shape = shapes.length ? (shapes.includes(aspect) ? aspect : shapes[0]) : undefined;
  const lengthSec = kind === "text_to_image" ? undefined : duration;
  const creating = path === "ai" && (Boolean(brief) || freeform);

  /** Carry a brief into Create: the prompt, the kind, the length nearest the brief's, the caption. */
  function applyBrief(b: CreativeBrief, from: Idea | null) {
    setKind(b.kind);
    setModelId(DEFAULT_MODEL[b.kind]);
    setPrompt(b.prompt);
    setPromptOwn(false);
    const m = modelById(DEFAULT_MODEL[b.kind]);
    const opts = m ? durationsFor(plan, m) : [];
    if (opts.length) setDuration(opts.reduce((best, d) => (Math.abs(d - b.durationSec) < Math.abs(best - b.durationSec) ? d : best), opts[0]));
    setCaption(b.caption || from?.caption || "");
    setHashtags((from?.hashtags ?? []).join(" "));
    setChecked({});
  }

  // The price of exactly this request, from the provider's live estimate; only once there is something to make.
  const [price, setPrice] = useState<number | null>(null);
  const [pricing, setPricing] = useState(false);
  const [priceErr, setPriceErr] = useState<string | null>(null);
  useEffect(() => {
    if (!creating || !model || !planAllowsModel(plan, model) || (lengthSec != null && !lengths.includes(lengthSec))) return;
    let stale = false;
    setPrice(null); setPriceErr(null); setPricing(true);
    const t = setTimeout(() => {
      api<{ credits: number }>("/api/studio-ai/quote", { method: "POST", body: JSON.stringify({ kind, modelId: model.id, durationSec: lengthSec, aspectRatio: shape }) })
        .then((r) => { if (!stale) setPrice(r.credits); })
        .catch((e) => { if (!stale) setPriceErr(errorText(e)); })
        .finally(() => { if (!stale) setPricing(false); });
    }, 250);
    return () => { stale = true; clearTimeout(t); };
  }, [creating, kind, model, lengthSec, shape, plan, lengths]);

  const loadJob = useCallback(async (id: string) => {
    const r = await api<{ job: Job; outputs: Output[] }>(`/api/studio-ai/jobs/${id}`);
    setJobs((js) => js.map((j) => (j.id === id ? r.job : j)));
    if (r.job.status === "done") setOutputs((m) => ({ ...m, [id]: r.outputs }));
    return r.job;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ jobs: Job[]; balance: number | null }>("/api/studio-ai/jobs");
        setJobs(r.jobs); setBalance(r.balance);
        for (const j of r.jobs.filter((x) => x.status === "done").slice(0, 6)) void loadJob(j.id);
      } catch (e) { setErr(errorText(e)); } finally { setLoading(false); }
    })();
  }, [loadJob]);

  usePolling(jobs, loadJob, 8_000, () => { void api<{ balance: number | null }>("/api/studio-ai/jobs").then((r) => setBalance(r.balance)).catch(() => null); });

  async function getIdeas() {
    setThinking(true); setIdeaErr(null);
    try {
      const r = await api<{ ideas: Idea[]; used: string | null; missing: string | null }>("/api/studio-ai/ideas", { method: "POST", body: JSON.stringify({ goal, about: about || null, draft: goal === "improve" ? draft : null }) });
      setIdeas(r.ideas); setUsed(r.used); setMissing(r.missing); setIdeaId(null); setFreeform(false);
    } catch (e) { setIdeaErr(errorText(e)); } finally { setThinking(false); }
  }

  /** Develop an idea: its brief, written once and kept. */
  async function develop(i: Idea) {
    setIdeaId(i.id); setBriefErr(null); setFreeform(false);
    document.getElementById("ai-develop")?.scrollIntoView({ behavior: "smooth", block: "start" });
    const kept = briefs[i.id];
    if (kept) { applyBrief(kept, i); return; }
    setBriefing(true);
    try {
      const r = await api<{ brief: CreativeBrief }>("/api/studio-ai/brief", { method: "POST", body: JSON.stringify({ idea: i, goal }) });
      setBriefs((m) => ({ ...m, [i.id]: r.brief }));
      applyBrief(r.brief, i);
    } catch (e) { setBriefErr(errorText(e)); } finally { setBriefing(false); }
  }

  /** Edit one field of the brief; editing a visual beat rebuilds the prompt (no AI call) unless the person wrote their own. */
  function editBrief(patch: Partial<CreativeBrief>) {
    if (!ideaId || !brief) return;
    const next = { ...brief, ...patch };
    setBriefs((m) => ({ ...m, [ideaId]: next }));
    if (!promptOwn && ("openingShot" in patch || "buildUp" in patch || "payoff" in patch)) setPrompt(promptFromBrief(next));
  }

  function filmIt() {
    if (!brief) return;
    handFiles("edit", [], { prompt: `${briefText(brief)}\n\nMake the video from my clips following this brief.` });
    router.push("/studio?mode=edit");
  }

  async function generate() {
    setErr(null);
    if (!model) return;
    try {
      let inputImagePath: string | null = null;
      if (kind === "image_to_video") {
        if (!image) throw new Error("Choose a start image first.");
        setBusy("Uploading");
        const up = await api<{ path: string; signedUrl: string }>("/api/studio-ai/upload", { method: "POST", body: JSON.stringify({ contentType: image.type, bytes: image.size }) });
        await uploadToSigned(up.signedUrl, image);
        inputImagePath = up.path;
      }
      setBusy("Starting");
      const r = await api<{ job: Job; balance: number | null }>("/api/studio-ai/jobs", {
        method: "POST",
        body: JSON.stringify({ kind, modelId: model.id, prompt, durationSec: lengthSec, aspectRatio: shape, inputImagePath, idea, caption: caption || null, hashtags: hashtags.split(/[\s,]+/).filter(Boolean) }),
      });
      setJobs((js) => [r.job, ...js]); setBalance(r.balance);
      document.getElementById("ai-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setErr(errorText(e));
    } finally { setBusy(null); }
  }

  async function remove(job: Job) {
    setRemoveBusy(true); setRemoveErr(null);
    try {
      await api(`/api/studio-ai/jobs/${job.id}`, { method: "DELETE" });
      setJobs((js) => js.filter((j) => j.id !== job.id));
      setRemoving(null);
    } catch (e) { setRemoveErr(errorText(e)); } finally { setRemoveBusy(false); }
  }

  const canGenerate = canMutate && !busy && prompt.trim().length > 3 && price != null && (kind !== "image_to_video" || Boolean(image));
  const n = shotsLeft(balance, price);
  const recommended = DEFAULT_MODEL[kind];
  const goalHint = STUDIO_GOALS.find((g) => g.id === goal)?.hint;

  return (
    <div className="ai-page">
      {/* ---- 1 Ideate ---- */}
      <section className="ai-panel">
        <div className="ai-panel-head"><Lightbulb size={16} aria-hidden /><h2>1. Ideate: what do you want to make?</h2></div>
        <div className="ai-goals" role="radiogroup" aria-label="What you want">
          {STUDIO_GOALS.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={goal === g.id} className={`ai-goal${goal === g.id ? " is-on" : ""}`} onClick={() => setGoal(g.id)}>{g.label}</button>
          ))}
        </div>
        {goalHint && <p className="ai-note">{goalHint} SOCIA reads your brand profile{goal === "best" ? " and your best posts" : goal === "trending" ? " and the Reels that took off in your niche" : ""}, so you don&apos;t need to describe your business.</p>}
        {goal === "improve" ? (
          <label className="ai-field"><span>Your idea or script</span>
            <textarea value={draft} rows={4} maxLength={1500} onChange={(e) => setDraft(e.target.value)} placeholder="Paste the idea, hook or script you want SOCIA to make stronger." />
          </label>
        ) : (
          <label className="ai-field"><span>About (optional)</span><input type="text" value={about} maxLength={200} onChange={(e) => setAbout(e.target.value)} placeholder="a new menu item, the morning rush, a tip for first-timers" /></label>
        )}
        <div className="ai-submit">
          <button type="button" className="btn-secondary" onClick={getIdeas} disabled={thinking || !aiReady || (goal === "improve" && draft.trim().length < 10)} aria-busy={thinking || undefined}>
            {thinking ? <><Loader2 size={14} className="spin" aria-hidden /> Thinking</> : ideas.length ? "New ideas" : goal === "improve" ? "Improve it" : "Get ideas"}
          </button>
          {!freeform && <button type="button" className="ai-act is-quiet" onClick={() => { setFreeform(true); setIdeaId(null); setPath("ai"); document.getElementById("ai-create")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Or write the prompt yourself</button>}
        </div>
        {!aiReady && <p className="ai-note">SOCIA AI is not configured on this server, so ideas are off. You can still write the prompt yourself.</p>}
        {ideaErr && <p className="ai-err" role="alert">{ideaErr}</p>}
        {used && ideas.length > 0 && <p className="ai-note">Read for these ideas: {used}.</p>}
        {missing && <p className="ai-note">{missing}</p>}
        {ideas.length > 0 && (
          <ul className="ai-ideas">
            {ideas.map((i) => (
              <li key={i.id} className={`ai-idea${ideaId === i.id ? " is-on" : ""}`}>
                <b>{i.hook}</b>
                <p>{i.concept}</p>
                {i.why && <p className="ai-why">{i.why}</p>}
                {i.ref && <a className="ai-ref" href={i.ref.url} target="_blank" rel="noopener noreferrer">Adapts {i.ref.account}{i.ref.result ? `, ${i.ref.result}` : ""} <ExternalLink size={12} aria-hidden /></a>}
                <div className="ai-idea-foot"><span className="ai-kind">{KIND_LABEL[i.kind]}</span><button type="button" className="ai-act is-primary" onClick={() => develop(i)}>{briefs[i.id] ? "Open the brief" : "Develop this"}</button></div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- 2 Develop: the creative brief ---- */}
      {(idea || briefing) && !freeform && (
        <section className="ai-panel" id="ai-develop">
          <div className="ai-panel-head"><NotebookPen size={16} aria-hidden /><h2>2. Develop: the creative brief</h2></div>
          {briefing && <p className="ai-note" role="status"><Loader2 size={14} className="spin" aria-hidden /> Writing the brief. Nothing is charged for media until you make it.</p>}
          {briefErr && <p className="ai-err" role="alert">{briefErr} <button type="button" className="ai-act is-quiet" onClick={() => idea && develop(idea)}>Try again</button></p>}
          {brief && (
            <>
              <p className="ai-note">Change anything here. The steps below follow your edits, and editing costs nothing.</p>
              <div className="ai-cb">
                <label className="ai-field"><span>Hook</span><input type="text" value={brief.hook} maxLength={120} onChange={(e) => editBrief({ hook: e.target.value })} /></label>
                <label className="ai-field"><span>Opening shot</span><textarea rows={2} value={brief.openingShot} maxLength={400} onChange={(e) => editBrief({ openingShot: e.target.value })} /></label>
                <label className="ai-field"><span>Build-up</span><textarea rows={2} value={brief.buildUp} maxLength={400} onChange={(e) => editBrief({ buildUp: e.target.value })} /></label>
                <label className="ai-field"><span>Payoff</span><textarea rows={2} value={brief.payoff} maxLength={400} onChange={(e) => editBrief({ payoff: e.target.value })} /></label>
                <label className="ai-field"><span>Call to action</span><input type="text" value={brief.cta} maxLength={160} onChange={(e) => editBrief({ cta: e.target.value })} /></label>
                <div className="ai-cb-facts">
                  <span><b>Format</b> {BRIEF_FORMAT}</span>
                  <label><b>Length</b> <input type="number" min={5} max={30} value={brief.durationSec} onChange={(e) => editBrief({ durationSec: Math.min(30, Math.max(5, Number(e.target.value) || 15)) })} /> seconds</label>
                </div>
                {brief.onScreenText.length > 0 && <p className="ai-cb-line"><b>On-screen text</b> {brief.onScreenText.map((t) => `“${t}”`).join(", then ")}</p>}
              </div>

              <div className="ai-paths">
                <SegmentedControl label="How to make it" role="tablist" value={path} onChange={(v) => setPath(v)}
                  options={[{ value: "ai", label: "Create with AI" }, { value: "film", label: "Film it myself" }]} />
                <small>{path === "ai" ? "SOCIA prepares the prompt and shows the price before anything is made." : "No credits: a checklist, a shot-by-shot guide and a script, then your clips go into the video editor."}</small>
              </div>
            </>
          )}
        </section>
      )}

      {/* ---- 3 Create: film it ---- */}
      {brief && path === "film" && !freeform && (
        <section className="ai-panel" id="ai-create">
          <div className="ai-panel-head"><Camera size={16} aria-hidden /><h2>3. Create: film it yourself</h2></div>
          {brief.checklist.length > 0 && (
            <>
              <h3 className="ai-sub">Before you film</h3>
              <ul className="ai-checklist">
                {brief.checklist.map((c) => (
                  <li key={c}><label className="ai-check"><input type="checkbox" checked={Boolean(checked[c])} onChange={(e) => setChecked((m) => ({ ...m, [c]: e.target.checked }))} /> {c}</label></li>
                ))}
              </ul>
            </>
          )}
          {brief.shots.length > 0 && (
            <>
              <h3 className="ai-sub">Shot by shot</h3>
              <ol className="ai-shots">
                {brief.shots.map((s, i) => (
                  <li key={i}><b>{s.shot}</b> <span className="ai-shot-sec">{s.seconds} s</span><p>{s.how}</p></li>
                ))}
              </ol>
            </>
          )}
          {brief.script && <><h3 className="ai-sub">What to say</h3><p className="ai-script">{brief.script}</p></>}
          {brief.onScreenText.length > 0 && <><h3 className="ai-sub">On-screen text</h3><ol className="ai-shots">{brief.onScreenText.map((t) => <li key={t}>{t}</li>)}</ol></>}
          <div className="ai-submit">
            <button type="button" className="btn-primary" onClick={filmIt}><Film size={14} aria-hidden /> Open the video editor with this brief</button>
            <small>Add your clips there; the editor cuts them to this brief.</small>
          </div>
        </section>
      )}

      {/* ---- 3 Create: with AI ---- */}
      {creating && (
        <section className="ai-panel" id="ai-create">
          <div className="ai-panel-head"><Film size={16} aria-hidden /><h2>3. Create with AI</h2></div>
          {!freeform && (
            <p className="ai-note">
              SOCIA prepared the prompt from your brief. Recommended: <b>{modelById(recommended)?.name ?? recommended}</b>{MODEL_WHY[recommended] ? `, ${MODEL_WHY[recommended]}` : ""}.
            </p>
          )}
          {freeform && (
            <div className="ai-tabs" role="tablist">
              {(Object.keys(KIND_LABEL) as GenerationKind[]).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={kind === k} className={`ai-tab${kind === k ? " is-on" : ""}`} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
              ))}
            </div>
          )}
          {freeform && (
            <label className="ai-field"><span>{kind === "text_to_image" ? "What the image shows" : "What the video shows"}</span>
              <textarea value={prompt} rows={4} maxLength={2500} onChange={(e) => setPrompt(e.target.value)} placeholder="The subject, the setting, the light, the camera and the motion. No text or logos in the frame." />
            </label>
          )}
          <div className="ai-options">
            {kind !== "text_to_image" && model?.durations && (
              <label className="ai-field ai-field-short"><span>Length</span>
                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>{model.durations.map((d) => <option key={d} value={d} disabled={!lengths.includes(d)}>{d} s{lengths.includes(d) ? "" : " (on Scale)"}</option>)}</select>
              </label>
            )}
            {shapes.length > 0 && (
              <label className="ai-field ai-field-short"><span>Shape</span>
                <select value={shape} onChange={(e) => setAspect(e.target.value)}>{shapes.map((a) => <option key={a} value={a}>{a}{a === "9:16" ? " (Reels)" : ""}</option>)}</select>
              </label>
            )}
          </div>
          {!freeform && (
            <details className="ai-advanced">
              <summary>Advanced: model, prompt and start image</summary>
              <div className="ai-tabs" role="tablist">
                {(Object.keys(KIND_LABEL) as GenerationKind[]).map((k) => (
                  <button key={k} type="button" role="tab" aria-selected={kind === k} className={`ai-tab${kind === k ? " is-on" : ""}`} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
                ))}
              </div>
              <label className="ai-field"><span>Model</span>
                <select value={model?.id ?? ""} onChange={(e) => setModelId(e.target.value)}>
                  {models.map((m) => <option key={m.id} value={m.id} disabled={!planAllowsModel(plan, m)}>{m.name}{m.id === recommended ? " (recommended)" : ""}{planAllowsModel(plan, m) ? "" : " (on Scale)"}</option>)}
                </select>
                {model && <small>{model.note}</small>}
              </label>
              <label className="ai-field"><span>Prompt for the generator</span>
                <textarea value={prompt} rows={4} maxLength={2500} onChange={(e) => { setPrompt(e.target.value); setPromptOwn(true); }} />
                {promptOwn && brief && <small><button type="button" className="ai-act is-quiet" onClick={() => { setPrompt(promptFromBrief(brief)); setPromptOwn(false); }}>Rebuild it from the brief</button></small>}
              </label>
            </details>
          )}
          {kind === "image_to_video" && (
            <label className="ai-field"><span>Start image (.jpg, .png, .webp)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImage(e.target.files?.[0] ?? null)} /></label>
          )}
          <label className="ai-field"><span>Caption (optional)</span><textarea value={caption} rows={2} maxLength={2200} onChange={(e) => setCaption(e.target.value)} /></label>
          <label className="ai-field"><span>Hashtags (optional)</span><input type="text" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="coffee smallbusiness" /></label>
          {pricing && <p className="ai-note" role="status">Checking the price for this request.</p>}
          {priceErr && <p className="ai-err" role="alert">The price couldn&apos;t be read, so nothing can be generated yet. {priceErr}</p>}
          <CreditsLine balance={balance} price={price} />
          {n != null && n > 0 && <p className="ai-note">Enough for about {n.toLocaleString("en-US")} {kind === "text_to_image" ? (n === 1 ? "image" : "images") : `${n === 1 ? "clip" : "clips"} of ${lengthSec} seconds`} like this.</p>}
          {err && <p className="ai-err" role="alert">{err}</p>}
          <div className="ai-submit">
            <button type="button" className="btn-primary" onClick={generate} disabled={!canGenerate} aria-busy={Boolean(busy) || undefined}>
              {busy ? <><Loader2 size={14} className="spin" aria-hidden /> {busy}</> : price != null ? `Generate for ${price.toLocaleString("en-US")} credits` : "Generate"}
            </button>
            {!canMutate && <small>Only the brand&apos;s owner or an admin can generate.</small>}
          </div>
        </section>
      )}

      {/* ---- what was made: refine in the editor, schedule ---- */}
      <section className="ai-panel" id="ai-results">
        <div className="ai-panel-head"><h2>Made in AI Studio</h2>{loading && <Loader2 size={14} className="spin" aria-hidden />}</div>
        {!loading && jobs.length === 0 && <p className="ai-empty">Nothing made yet. Pick what you want above, develop an idea, then make it.</p>}
        <ul className="ai-jobs">
          {jobs.map((j) => (
            <li key={j.id} className="ai-job is-open">
              <div className="ai-job-row">
                <span className="ai-job-src">{j.idea?.hook ?? j.prompt}</span>
                <span className="ai-job-meta">{KIND_LABEL[j.kind]} · {modelById(j.model)?.name ?? j.model} · {j.credits_charged ?? j.credits_reserved} credits · {when(j.created_at)}</span>
                <StatusChip status={j.status} />
              </div>
              {j.status === "failed" && <p className="ai-err">{j.error ?? "The generation failed."} {j.credits_charged === 0 && "Your credits are back."}</p>}
              {j.status === "done" && (
                <div className="ai-grid">
                  {(outputs[j.id] ?? []).map((o) => (
                    <MediaCard key={o.id} kind="generation" id={o.id} title={o.title ?? j.prompt.slice(0, 80)} isVideo={o.kind === "video"} playUrl={o.playUrl} downloadUrl={o.downloadUrl} caption={o.caption ?? ""} hashtags={o.hashtags ?? []} canMutate={canMutate} onDelete={() => { setRemoveErr(null); setRemoving(j); }} />
                  ))}
                  {!outputs[j.id] && <p className="ai-note"><Loader2 size={14} className="spin" aria-hidden /> Loading</p>}
                </div>
              )}
              {canMutate && j.status !== "done" && j.status !== "processing" && <button type="button" className="ai-act is-quiet ai-job-remove" onClick={() => { setRemoveErr(null); setRemoving(j); }}>Remove</button>}
            </li>
          ))}
        </ul>
      </section>
      <ConfirmDialog open={Boolean(removing)} onOpenChange={(o) => { if (!o) setRemoving(null); }} danger busy={removeBusy}
        title="Remove this generation?" confirmLabel="Remove"
        body={removeErr ?? "It and anything it made are deleted, and this can't be undone. Drafts already sent to the scheduler stay."}
        onConfirm={() => { if (removing) return remove(removing); }} />
    </div>
  );
}

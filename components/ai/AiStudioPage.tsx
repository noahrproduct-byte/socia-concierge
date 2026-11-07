"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Film, Lightbulb, Loader2 } from "lucide-react";
import { DEFAULT_MODEL, GENERATION_MODELS, generationCredits, modelById, type GenerationKind } from "@/lib/credits/config";
import { ConfirmDialog } from "@/components/system";
import { api, errorText, isCreditsShort, usePolling, uploadToSigned, CreditsLine, StatusChip, MediaCard } from "./shared";

type Idea = { id: string; hook: string; concept: string; shot: string; kind: GenerationKind; caption: string; hashtags: string[] };
type Job = { id: string; status: "queued" | "processing" | "done" | "failed" | "cancelled"; kind: GenerationKind; model: string; prompt: string; credits_reserved: number; credits_charged: number | null; error: string | null; created_at: string; idea: Idea | null };
type Output = { id: string; kind: "video" | "image"; title: string | null; caption: string | null; hashtags: string[]; playUrl: string | null; downloadUrl: string | null; duration_ms: number | null };

const KIND_LABEL: Record<GenerationKind, string> = { text_to_video: "Text to video", image_to_video: "Image to video", text_to_image: "Text to image" };
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function AiStudioPage({ initialBalance, canMutate, aiReady }: { initialBalance: number | null; canMutate: boolean; aiReady: boolean }) {
  const [balance, setBalance] = useState<number | null>(initialBalance);
  const [about, setAbout] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [thinking, setThinking] = useState(false);
  const [ideaErr, setIdeaErr] = useState<string | null>(null);

  const [kind, setKind] = useState<GenerationKind>("text_to_video");
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL.text_to_video);
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<number>(6);
  const [aspect, setAspect] = useState<string>("9:16");
  const [image, setImage] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [idea, setIdea] = useState<Idea | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // The generation waiting for "Remove" in the dialog; a failed delete keeps it open and says why.
  const [removing, setRemoving] = useState<Job | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeErr, setRemoveErr] = useState<string | null>(null);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [outputs, setOutputs] = useState<Record<string, Output[]>>({});
  const [loading, setLoading] = useState(true);

  const models = useMemo(() => GENERATION_MODELS.filter((m) => m.kinds.includes(kind)), [kind]);
  const model = modelById(modelId) ?? models[0];
  useEffect(() => { if (!model || !model.kinds.includes(kind)) setModelId(DEFAULT_MODEL[kind]); }, [kind, model]);
  useEffect(() => { if (model?.durations && !model.durations.includes(duration)) setDuration(model.durations[0]); if (model?.aspectRatios && !model.aspectRatios.includes(aspect)) setAspect(model.aspectRatios[0]); }, [model, duration, aspect]);
  const price = model ? generationCredits(model.id, kind, duration) : null;

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
      const r = await api<{ ideas: Idea[] }>("/api/studio-ai/ideas", { method: "POST", body: JSON.stringify({ about: about || null }) });
      setIdeas(r.ideas);
    } catch (e) { setIdeaErr(errorText(e)); } finally { setThinking(false); }
  }

  function pickIdea(i: Idea) {
    setIdea(i); setKind(i.kind); setModelId(DEFAULT_MODEL[i.kind]); setPrompt(i.shot); setCaption(i.caption); setHashtags(i.hashtags.join(" "));
    document.getElementById("ai-make")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        body: JSON.stringify({ kind, modelId: model.id, prompt, durationSec: kind === "text_to_image" ? undefined : duration, aspectRatio: aspect, inputImagePath, idea, caption: caption || null, hashtags: hashtags.split(/[\s,]+/).filter(Boolean) }),
      });
      setJobs((js) => [r.job, ...js]); setBalance(r.balance);
    } catch (e) {
      setErr(isCreditsShort(e) ? "Not enough credits for this. Buy a top-up in Settings or wait for next month's allowance." : errorText(e));
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

  return (
    <div className="ai-page">
      <section className="ai-panel">
        <div className="ai-panel-head"><Lightbulb size={16} aria-hidden /><h2>Step 1: ideas from your brand</h2></div>
        <p className="ai-note">SOCIA writes ideas from the niche, voice and goals in your profile. Each one is a hook, a concept, what the camera sees, and a caption.</p>
        <div className="ai-row">
          <label className="ai-field ai-grow"><span>About (optional)</span><input type="text" value={about} maxLength={200} onChange={(e) => setAbout(e.target.value)} placeholder="a new menu item, the morning rush, a tip for first-timers" /></label>
          <button type="button" className="btn-secondary" onClick={getIdeas} disabled={thinking || !aiReady} aria-busy={thinking || undefined}>{thinking ? <><Loader2 size={14} className="spin" aria-hidden /> Thinking</> : ideas.length ? "More ideas" : "Get ideas"}</button>
        </div>
        {!aiReady && <p className="ai-note">SOCIA AI is not configured on this server, so ideas are off. You can still write a prompt below.</p>}
        {ideaErr && <p className="ai-err" role="alert">{ideaErr}</p>}
        {ideas.length > 0 && (
          <ul className="ai-ideas">
            {ideas.map((i) => (
              <li key={i.id} className={`ai-idea${idea?.id === i.id ? " is-on" : ""}`}>
                <b>{i.hook}</b>
                <p>{i.concept}</p>
                <p className="ai-shot">{i.shot}</p>
                <div className="ai-idea-foot"><span className="ai-kind">{KIND_LABEL[i.kind]}</span><button type="button" className="ai-act is-primary" onClick={() => pickIdea(i)}>Use this</button></div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ai-panel" id="ai-make">
        <div className="ai-panel-head"><Film size={16} aria-hidden /><h2>Step 2: make it</h2></div>
        <div className="ai-tabs" role="tablist">
          {(Object.keys(KIND_LABEL) as GenerationKind[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={`ai-tab${kind === k ? " is-on" : ""}`} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
          ))}
        </div>
        <label className="ai-field"><span>Model</span>
          <select value={model?.id ?? ""} onChange={(e) => setModelId(e.target.value)}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}: {m.usdPerSecond != null ? `${generationCredits(m.id, kind, m.durations?.[0] ?? 5)} credits for ${m.durations?.[0] ?? 5} s` : `${generationCredits(m.id, "text_to_image")} credits an image`}</option>)}
          </select>
          {model && <small>{model.note}</small>}
        </label>
        {kind === "image_to_video" && (
          <label className="ai-field"><span>Start image (.jpg, .png, .webp)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImage(e.target.files?.[0] ?? null)} /></label>
        )}
        <label className="ai-field"><span>{kind === "text_to_image" ? "What the image shows" : "What the video shows"}</span>
          <textarea value={prompt} rows={4} maxLength={2500} onChange={(e) => setPrompt(e.target.value)} placeholder="The subject, the setting, the light, the camera and the motion. No text or logos in the frame." />
        </label>
        <div className="ai-options">
          {kind !== "text_to_image" && model?.durations && (
            <label className="ai-field ai-field-short"><span>Length</span>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>{model.durations.map((d) => <option key={d} value={d}>{d} s</option>)}</select>
            </label>
          )}
          {model?.aspectRatios && (
            <label className="ai-field ai-field-short"><span>Shape</span>
              <select value={aspect} onChange={(e) => setAspect(e.target.value)}>{model.aspectRatios.map((a) => <option key={a} value={a}>{a}{a === "9:16" ? " (Reels)" : ""}</option>)}</select>
            </label>
          )}
        </div>
        <label className="ai-field"><span>Caption (optional)</span><textarea value={caption} rows={2} maxLength={2200} onChange={(e) => setCaption(e.target.value)} /></label>
        <label className="ai-field"><span>Hashtags (optional)</span><input type="text" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="coffee smallbusiness" /></label>
        <CreditsLine balance={balance} price={price} />
        {err && <p className="ai-err" role="alert">{err}</p>}
        <div className="ai-submit">
          <button type="button" className="btn-primary" onClick={generate} disabled={!canGenerate} aria-busy={Boolean(busy) || undefined}>{busy ? <><Loader2 size={14} className="spin" aria-hidden /> {busy}</> : "Generate"}</button>
          {!canMutate && <small>Only the brand&apos;s owner or an admin can generate.</small>}
        </div>
      </section>

      <section className="ai-panel">
        <div className="ai-panel-head"><h2>Results</h2>{loading && <Loader2 size={14} className="spin" aria-hidden />}</div>
        {!loading && jobs.length === 0 && <p className="ai-empty">Nothing made yet. Pick an idea above or write what the video should show.</p>}
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

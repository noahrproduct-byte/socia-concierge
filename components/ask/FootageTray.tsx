"use client";

// Footage in Ask SOCIA: the videos and photos the person drops into the chat,
// each saved as its own draft once they press the button (nothing is saved
// before that). Every file goes through the same steps as Create Post: it is
// measured, an oversized video is made smaller, it is uploaded to the
// person's own folder, and, when they ask for it, SOCIA writes the caption
// from what it sees and hears in that file. The drafts then belong to the
// chat, so "schedule these one a day at 6 PM" means exactly them.
import { useState } from "react";
import { AlertTriangle, Check, Film, Image as ImageIcon, Loader2, X } from "lucide-react";
import PlanNotice from "../PlanNotice";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import { createClient } from "@/lib/supabase/client";
import { fmtBytes } from "@/lib/publishing/mediaInfo";
import { removePostUpload, uploadForPost } from "@/lib/publishing/uploadForPost";
import { seeMedia, type SeePhase } from "@/lib/publishing/captionMedia";
import { fileLabel, postLabel } from "@/lib/publishing/postLabel";

export const MAX_FOOTAGE = 10;

type Step = "waiting" | "measuring" | "compressing" | "uploading" | SeePhase | "writing" | "saving" | "saved" | "failed";
type Row = { step: Step; note: string | null };
export type FootageResult = {
  names: string[]; drafts: { id: string; label: string }[]; failed: string[]; notes: string[];
  /** the plan page, when the captions allowance ran out on the way */
  planHref: string | null;
};

const STEP_COPY: Record<Step, string> = {
  waiting: "Waiting",
  measuring: "Reading the file",
  compressing: "Making it smaller to upload",
  uploading: "Uploading",
  seeing: "Looking at it",
  listening: "Listening to the sound",
  transcribing: "Transcribing what's said",
  writing: "Writing the caption",
  saving: "Saving the draft",
  saved: "Saved as a draft",
  failed: "Not saved",
};

type CaptionReply = { captions?: { text: string; warnings?: string[] }[]; error?: string };

export default function FootageTray({ files, onRemove, onClear, onDone, onBusy }: {
  files: File[];
  onRemove: (i: number) => void;
  onClear: () => void;
  /** every file has been tried; the drawer adds the outcome to the chat */
  onDone: (r: FootageResult) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [captions, setCaptions] = useState(true);
  const [rows, setRows] = useState<Record<number, Row>>({});
  const [running, setRunning] = useState(false);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, step: Step, note: string | null = null) => setRows((r) => ({ ...r, [i]: { step, note } }));

  const run = async () => {
    setRunning(true); onBusy(true); setError(null); setPlanError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("You're signed out. Sign in again to save footage."); setRunning(false); onBusy(false); return; }
    const result: FootageResult = { names: files.map((f) => f.name), drafts: [], failed: [], notes: [], planHref: null };
    let write = captions;
    for (let i = 0; i < files.length; i++) {
      let file = files[i];
      let path: string | null = null;
      try {
        const up = await uploadForPost(file, user.id, (st) => set(i, st));
        file = up.file; path = up.media.path;
        const media = up.media;

        let caption = "";
        if (write) {
          const seen = await seeMedia([media], { userId: user.id, fileFor: () => file, onPhase: (p) => set(i, p) });
          set(i, "writing");
          const res = await fetch("/api/publishing/caption", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "generate", destinations: [], perPlatform: false, draft: "", notes: "", collaborators: [], userTags: [], location: "auto",
              media: { kind: seen.kind, count: seen.count, durationSec: seen.durationSec },
              frames: seen.frames, frameTimes: seen.frameTimes, imageUrls: seen.imageUrls, transcript: seen.transcript, audio: seen.audio,
            }),
          }).catch(() => null);
          const j = res ? ((await res.json().catch(() => null)) as CaptionReply | null) : null;
          if (res?.ok && j?.captions?.[0]?.text) {
            caption = j.captions[0].text;
            if (j.captions[0].warnings?.length) result.notes.push(`${file.name}: ${j.captions[0].warnings.join(" ")}`);
          } else if (isPlanError(j)) {
            // The allowance ran out: the rest are saved without a caption.
            setPlanError(j); write = false; result.planHref = j.href;
            result.notes.push("Your hooks and captions allowance ran out, so the rest were saved without a caption.");
          } else {
            result.notes.push(`${file.name}: no caption (${j?.error ?? "SOCIA couldn't write one just now"}).`);
          }
        }

        set(i, "saving");
        const res = await fetch("/api/posts", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "draft", caption, media: [media], destinations: [], scheduledAt: null, source: "assistant" }),
        }).catch(() => null);
        const j = res ? ((await res.json().catch(() => null)) as { item?: { id: string }; error?: string } | null) : null;
        if (!res?.ok || !j?.item?.id) throw new Error(j?.error ?? "The draft couldn't be saved.");
        result.drafts.push({ id: j.item.id, label: postLabel(caption, []) ?? fileLabel(file.name) ?? file.name });
        set(i, "saved");
      } catch (e) {
        // A file whose draft wasn't saved doesn't stay in storage.
        if (path) await removePostUpload(path);
        const msg = e instanceof Error ? e.message : "It couldn't be saved.";
        set(i, "failed", msg);
        result.failed.push(`${file.name} (${msg.replace(/[.\s]+$/, "")})`);
      }
    }
    setRunning(false); onBusy(false);
    onDone(result);
  };

  const n = files.length;
  return (
    <section className="ask-footage" aria-label="Footage to save as drafts">
      <div className="ask-footage-head">
        <b>{n} {n === 1 ? "file" : "files"} to save as {n === 1 ? "a draft" : "drafts"}</b>
        {!running && <button type="button" className="ov-btn ghost small" onClick={onClear}>Clear</button>}
      </div>
      <ul className="ask-footage-list">
        {files.map((f, i) => {
          const r = rows[i];
          return (
            <li key={`${f.name}-${i}`} className={r?.step ?? "waiting"}>
              {f.type.startsWith("image/") ? <ImageIcon size={14} aria-hidden /> : <Film size={14} aria-hidden />}
              <span className="ask-footage-name"><b>{f.name}</b><small>{fmtBytes(f.size)}</small></span>
              {r ? (
                <small className="ask-footage-step" role={r.step === "failed" ? "alert" : undefined}>
                  {r.step === "saved" ? <Check size={11} /> : r.step === "failed" ? <AlertTriangle size={11} /> : r.step !== "waiting" ? <Loader2 size={11} className="spin" /> : null}
                  {r.note ? `${STEP_COPY[r.step]}: ${r.note}` : STEP_COPY[r.step]}
                </small>
              ) : !running && (
                <button type="button" className="ask-footage-x" onClick={() => onRemove(i)} aria-label={`Remove ${f.name}`}><X size={12} /></button>
              )}
            </li>
          );
        })}
      </ul>
      {!running && !Object.keys(rows).length && (
        <>
          <label className="ask-footage-opt">
            <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} />
            <span>Write a caption for each from what SOCIA sees and hears in it. Each caption counts toward your hooks and captions allowance.</span>
          </label>
          <div className="ask-proposal-actions">
            <button type="button" className="ov-btn primary small" onClick={() => void run()}>Save {n === 1 ? "as a draft" : `${n} drafts`}</button>
          </div>
        </>
      )}
      {planError && <PlanNotice error={planError} compact />}
      {error && <p className="cbb-err" role="alert"><AlertTriangle size={12} /> {error}</p>}
    </section>
  );
}

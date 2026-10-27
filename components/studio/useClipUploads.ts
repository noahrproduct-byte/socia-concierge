"use client";

// Adding clips, from any page: identify and measure each file on this
// device, reserve its slot under the plan (the API decides), upload the
// source, keyframes and sound, and mark it complete. Shared by Build from
// Clips (one shoot = one project) and Footage (the standing library), so
// "drop clips here" behaves the same everywhere.
import { useCallback, useMemo, useRef, useState } from "react";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { fingerprintFile, probeClip, ingestClip } from "@/lib/studioClips/ingest";
import { STUDIO_BUCKET, type StudioClip, type StudioProject } from "@/lib/studioClips/types";
import type { LocalClip } from "./ClipsViews";

type Paths = { folder: string; source: string; frames: string; audio: string };
type Registered = { key: string; file: File; probe: Awaited<ReturnType<typeof probeClip>>; clip: StudioClip; paths: Paths };

export const VIDEO_RE = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
const UPLOAD_CONCURRENCY = 2;

export const clipErrorCopy = (e: unknown): string => {
  const m = e instanceof Error ? e.message : String(e);
  if (m === "unsupported") return "Couldn't read this file in the browser. Export it as an H.264 MP4 and add it again.";
  if (m === "too_long") return "Longer than 10 minutes — trim it first.";
  if (m === "too_short") return "Shorter than a second.";
  return m.replace(/^Upload failed: /, "");
};

/** The server's clips, merged with whatever this device is still working on. */
export function mergeLocals(cur: LocalClip[], p: StudioProject): LocalClip[] {
  const inflight = cur.filter((l) => l.phase !== "done" && l.phase !== "duplicate" && !l.clip);
  const fromServer: LocalClip[] = p.clips.map((c) => {
    const prev = cur.find((l) => l.clip?.id === c.id);
    return {
      key: c.id, name: c.name, phase: c.status === "failed" ? "error" : "done", progress: 1, stageNote: null,
      error: c.status === "failed" ? c.error : null, thumb: c.frames[0]?.url ?? prev?.thumb ?? null, clip: c,
      durationSec: c.durationSec, reused: c.reused,
    };
  });
  return [...fromServer, ...inflight];
}

export type ClipUploads = {
  locals: LocalClip[];
  setLocals: React.Dispatch<React.SetStateAction<LocalClip[]>>;
  /** replace the list with the server's clips, keeping in-flight ones */
  syncLocals: (p: StudioProject) => void;
  /** add files to `project` (the caller resolves which project, creating it if needed) */
  addFiles: (list: FileList | File[], project: StudioProject) => Promise<void>;
  removeClip: (l: LocalClip) => Promise<boolean>;
  /** something is still being read, measured or uploaded */
  uploading: boolean;
  planError: PlanError | null;
  setPlanError: (e: PlanError | null) => void;
  notice: string | null;
  setNotice: (n: string | null) => void;
  /** clips the server has and whose footage is on file */
  readyClips: LocalClip[];
  footageSec: number;
  bytes: number;
};

export function useClipUploads(opts: { onChanged: (projectId: string) => void | Promise<void> }): ClipUploads {
  const supabase = useMemo(() => createClient(), []);
  const [locals, setLocals] = useState<LocalClip[]>([]);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(0);
  const onChanged = useRef(opts.onChanged);
  onChanged.current = opts.onChanged;

  const patchLocal = (key: string, patch: Partial<LocalClip>) => setLocals((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const syncLocals = useCallback((p: StudioProject) => setLocals((cur) => mergeLocals(cur, p)), []);

  /** Step 1, one file at a time: identify, measure the basics, reserve the slot (plan limits are checked here). */
  const registerFile = useCallback(async (file: File, p: StudioProject, key: string): Promise<Registered | null> => {
    try {
      patchLocal(key, { phase: "reading", progress: 0.1 });
      const [fingerprint, probe] = await Promise.all([fingerprintFile(file), probeClip(file)]);
      patchLocal(key, { phase: "registering", progress: 0.3, durationSec: probe.durationSec });
      const reg = await fetch("/api/studio/clips", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: p.id, fingerprint, name: file.name, mime: file.type || null, bytes: file.size, durationSec: probe.durationSec, width: probe.width, height: probe.height, recordedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null, ext: file.name.split(".").pop() }),
      });
      const rj = await reg.json().catch(() => null);
      if (reg.status === 409 && rj?.duplicate) { patchLocal(key, { phase: "duplicate", progress: 1 }); return null; }
      if (!reg.ok) {
        if (isPlanError(rj)) { setPlanError(rj); setLocals((cur) => cur.filter((l) => l.key !== key)); return null; }
        throw new Error(rj?.error ?? "Couldn't add this clip.");
      }
      const clip = rj.clip as StudioClip;
      patchLocal(key, { clip, reused: Boolean(rj.reused), phase: "analyzing", progress: 0, stageNote: "Waiting to measure" });
      return { key, file, probe, clip, paths: rj.paths as Paths };
    } catch (e) {
      patchLocal(key, { phase: "error", error: clipErrorCopy(e), stageNote: null });
      return null;
    }
  }, []);

  /** Step 2, a couple at a time: frames, sound and facts on this device, then the uploads. */
  const uploadFile = useCallback(async ({ key, file, probe, clip, paths }: Registered) => {
    try {
      patchLocal(key, { phase: "analyzing", progress: 0, stageNote: "Measuring picture and sound" });
      const ingest = await ingestClip(file, probe, (stage, done, total) => patchLocal(key, { progress: total ? done / total : 0, stageNote: stage === "frames" ? "Finding scene changes" : "Reading the sound" }));
      const first = ingest.frames[0];
      if (first) patchLocal(key, { thumb: URL.createObjectURL(first.blob) });

      patchLocal(key, { phase: "uploading", progress: 0, stageNote: "Uploading" });
      await uploadMedia(supabase, STUDIO_BUCKET, paths.source, file, (sent, total) => patchLocal(key, { progress: total ? sent / total : 0 }));
      const framePaths: { t: number; path: string }[] = [];
      for (let i = 0; i < ingest.frames.length; i++) {
        const path = `${paths.frames}${i}.jpg`;
        await uploadMedia(supabase, STUDIO_BUCKET, path, new File([ingest.frames[i].blob], `${i}.jpg`, { type: "image/jpeg" }));
        framePaths.push({ t: ingest.frames[i].t, path });
      }
      let audioPath: string | null = null;
      if (ingest.wav) {
        await uploadMedia(supabase, STUDIO_BUCKET, paths.audio, new File([ingest.wav], "audio.wav", { type: "audio/wav" }));
        audioPath = paths.audio;
      }
      const done = await fetch(`/api/studio/clips/${clip.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourcePath: paths.source, frames: framePaths, audioPath, facts: ingest.facts }) });
      const dj = await done.json().catch(() => null);
      if (!done.ok) throw new Error(dj?.error ?? "Couldn't finish adding this clip.");
      patchLocal(key, { phase: "done", progress: 1, stageNote: null, clip: dj as StudioClip });
    } catch (e) {
      patchLocal(key, { phase: "error", error: clipErrorCopy(e), stageNote: null });
    }
  }, [supabase]);

  const addFiles = useCallback(async (list: FileList | File[], p: StudioProject) => {
    const files = Array.from(list).filter((f) => f.type.startsWith("video/") || VIDEO_RE.test(f.name));
    if (!files.length) { setNotice("Drop video clips (MP4 or MOV). Photos come in a later step."); return; }
    setPlanError(null);
    const entries = files.map((f) => ({ key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file: f }));
    setLocals((cur) => [...cur, ...entries.map<LocalClip>((e) => ({ key: e.key, name: e.file.name, phase: "reading", progress: 0, stageNote: null, error: null, thumb: null, clip: null, durationSec: null, reused: false }))]);
    setBusy((n) => n + 1);
    try {
      // Register in order (positions and plan limits are decided server-side,
      // one clip at a time), then measure and upload a couple at a time.
      const registered: Registered[] = [];
      for (const e of entries) {
        const r = await registerFile(e.file, p, e.key);
        if (r) registered.push(r);
      }
      let i = 0;
      const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, registered.length) }, async () => {
        while (i < registered.length) await uploadFile(registered[i++]);
      });
      await Promise.all(workers);
    } finally {
      setBusy((n) => n - 1);
    }
    await onChanged.current(p.id);
  }, [registerFile, uploadFile]);

  const removeClip = useCallback(async (l: LocalClip): Promise<boolean> => {
    if (l.clip) {
      const res = await fetch(`/api/studio/clips/${l.clip.id}`, { method: "DELETE" });
      if (!res.ok) { setNotice("Couldn't remove that clip."); return false; }
    }
    setLocals((cur) => cur.filter((x) => x.key !== l.key));
    if (l.clip) await onChanged.current(l.clip.projectId);
    return true;
  }, []);

  const uploading = busy > 0;
  const readyClips = locals.filter((l) => l.phase === "done" && l.clip && (l.clip.status === "uploaded" || l.clip.status === "ready"));
  const footageSec = readyClips.reduce((a, l) => a + (l.durationSec ?? 0), 0);
  const bytes = readyClips.reduce((a, l) => a + (l.clip?.bytes ?? 0), 0);

  return { locals, setLocals, syncLocals, addFiles, removeClip, uploading, planError, setPlanError, notice, setNotice, readyClips, footageSec, bytes };
}

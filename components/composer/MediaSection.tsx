"use client";

// Section 2: the files. Drop zone and picker whose accepted types are the union
// over every implemented format of each enabled platform (so a JPEG can turn a
// Reel into an Image post after the drop), browser-side measurement (null when
// unmeasured), upload to the scheduled-media bucket under the person's own id,
// and the media-related readiness issues per enabled destination. Object URLs
// are owned and revoked by useComposer, which outlives this section.

import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { CAPABILITIES, formatSpec } from "@/lib/publishing/capabilities";
import { enabledDestinations, readinessFor, suggestInstagramFormat, type ComposerDraft, type PickerAccount } from "@/lib/publishing/composer";
import { PLATFORM_LABEL, type InstagramSettings, type MediaItem, type Platform } from "@/lib/publishing/types";
import { aspectLabel, fmtBytes, fmtDuration, measure, type MediaItemWithPreview } from "@/lib/publishing/mediaInfo";
import type { ComposerAction } from "./contracts";
import { accountFor } from "./DestinationPicker";

const BUCKET = "scheduled-media";

type UploadState = { status: "uploading" | "done" | "error"; message: string | null };

/**
 * Every MIME type any implemented format of these platforms accepts. Not the
 * currently chosen Instagram format: the format follows the file (a JPEG
 * dropped on a Reel draft becomes an Image post), and a file no enabled
 * platform can take is reported by readiness rather than refused here.
 */
export function acceptFor(platforms: Platform[]): string[] {
  const set = new Set<string>();
  const list = platforms.length ? platforms : (Object.keys(CAPABILITIES) as Platform[]);
  for (const p of list) for (const f of CAPABILITIES[p].formats) if (f.implemented) f.media.mimes.forEach((m) => set.add(m));
  return Array.from(set);
}

export default function MediaSection({
  draft, accounts, dispatch, userId, registerFile, fileFor, ensurePostId,
}: {
  draft: ComposerDraft;
  accounts: PickerAccount[];
  dispatch: (a: ComposerAction) => void;
  userId: string;
  registerFile: (mediaId: string, file: File) => void;
  fileFor: (mediaId: string) => File | null;
  ensurePostId: () => Promise<string | null>;
}) {
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const enabledPlatforms = enabledDestinations(draft).map((d) => d.platform);
  const platformsKey = Array.from(new Set(enabledPlatforms)).sort().join(",");
  const accept = useMemo(() => acceptFor(platformsKey ? (platformsKey.split(",") as Platform[]) : []), [platformsKey]);
  const acceptLabel = useMemo(
    () => Array.from(new Set(accept.map((m) => m.split("/")[1].replace("quicktime", "mov").replace("x-m4v", "m4v").toUpperCase()))),
    [accept],
  );
  const media = draft.media as MediaItemWithPreview[];

  const setUpload = (id: string, s: UploadState | null) =>
    setUploads((u) => { const n = { ...u }; if (s) n[id] = s; else delete n[id]; return n; });

  const upload = useCallback(async (item: MediaItem, file: File) => {
    setUpload(item.id, { status: "uploading", message: null });
    try {
      const postId = await ensurePostId();
      if (!postId) throw new Error("The draft could not be saved, so the file has nowhere to go yet.");
      const supabase = createClient();
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${userId}/${postId}/${Date.now()}_${safe}`;
      await uploadMedia(supabase, BUCKET, path, file);
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      dispatch({ type: "update_media", id: item.id, patch: { path, url: data.publicUrl } });
      setUpload(item.id, { status: "done", message: null });
    } catch (e) {
      setUpload(item.id, { status: "error", message: e instanceof Error ? e.message : "The upload failed." });
    }
  }, [dispatch, ensurePostId, userId]);

  const followInstagram = useCallback((next: MediaItem[]) => {
    const d = draftRef.current;
    for (const dest of d.destinations.filter((x) => x.enabled && x.platform === "instagram")) {
      const s = dest.settings as InstagramSettings;
      const suggested = suggestInstagramFormat(next);
      const spec = formatSpec("instagram", s.format);
      const fits = spec ? next.every((m) => spec.media.kinds.includes(m.kind)) && next.length <= spec.media.maxItems && next.length >= Math.min(1, spec.media.minItems) : true;
      if (suggested !== s.format && (next.length > 1 || !fits)) {
        dispatch({ type: "set_settings", key: dest.key, settings: { ...s, format: suggested } });
      }
    }
  }, [dispatch]);

  const addFiles = useCallback(async (list: FileList | File[]) => {
    const files = Array.from(list);
    if (!files.length) return;
    setNotice(null);
    const items: MediaItemWithPreview[] = [];
    for (const f of files) {
      const m = await measure(f);
      const item: MediaItemWithPreview = {
        id: crypto.randomUUID(), kind: m.kind, name: f.name, mime: m.mime ?? "", size: f.size,
        width: m.width ?? null, height: m.height ?? null, duration: m.duration ?? null, path: null, url: null, previewUrl: m.previewUrl,
      };
      registerFile(item.id, f);
      items.push(item);
    }
    dispatch({ type: "add_media", items });
    followInstagram([...draftRef.current.media, ...items]);
    for (let i = 0; i < items.length; i++) await upload(items[i], files[i]);
  }, [dispatch, followInstagram, registerFile, upload]);

  const replaceFile = useCallback(async (id: string, f: File) => {
    const prev = draftRef.current.media.find((m) => m.id === id);
    const m = await measure(f);
    // The old preview URL leaves the draft here; useComposer revokes it.
    const patch: Partial<MediaItemWithPreview> = {
      kind: m.kind, name: f.name, mime: m.mime ?? "", size: f.size, width: m.width ?? null, height: m.height ?? null, duration: m.duration ?? null,
      path: null, url: null, previewUrl: m.previewUrl, poster: null,
    };
    registerFile(id, f);
    dispatch({ type: "update_media", id, patch });
    followInstagram(draftRef.current.media.map((x) => (x.id === id ? { ...x, ...patch } as MediaItem : x)));
    if (prev?.path) void createClient().storage.from(BUCKET).remove([prev.path]).catch(() => null);
    await upload({ ...(prev ?? ({} as MediaItem)), ...patch, id } as MediaItem, f);
  }, [dispatch, followInstagram, registerFile, upload]);

  const remove = useCallback((item: MediaItemWithPreview) => {
    dispatch({ type: "remove_media", id: item.id });
    setUpload(item.id, null);
    if (item.path) void createClient().storage.from(BUCKET).remove([item.path]).catch(() => null);
    followInstagram(draftRef.current.media.filter((m) => m.id !== item.id));
  }, [dispatch, followInstagram]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= media.length) return;
    const next = [...media];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    dispatch({ type: "set_media", media: next });
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    // Same union as the picker's accept list. A file with no reported type is kept; readiness says it will be checked at upload.
    const ok = files.filter((f) => accept.length === 0 || accept.includes(f.type) || !f.type);
    if (ok.length < files.length) {
      const skipped = files.filter((f) => !ok.includes(f));
      const n = skipped.length;
      setNotice(`${n} ${n === 1 ? "file was" : "files were"} not added (${skipped.map((f) => f.type || f.name).join(", ")}): none of the selected platforms accepts that type. Accepted: ${acceptLabel.join(", ")}.`);
    }
    void addFiles(ok);
  };

  // Media-related readiness per enabled destination.
  const issues = enabledDestinations(draft).map((d) => ({
    key: d.key,
    label: `${PLATFORM_LABEL[d.platform]}${accountFor(d, accounts)?.handle ? ` · @${accountFor(d, accounts)!.handle!.replace(/^@/, "")}` : ""}`,
    items: readinessFor(draft, d, accounts).issues.filter((i) => i.code.startsWith("media_")),
  })).filter((g) => g.items.length);

  return (
    <div className="cp-media" data-field="media">
      <div
        className={`cp-drop${dragging ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
      >
        <Upload size={16} />
        <span><strong>Drop files here</strong> or choose from your device</span>
        <small>{acceptLabel.length ? acceptLabel.join(", ") : "Any image or video"}</small>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept.join(",")}
          onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }}
          hidden
        />
      </div>
      <input
        ref={replaceRef}
        type="file"
        accept={accept.join(",")}
        onChange={(e) => {
          const f = e.target.files?.[0];
          const id = replacing.current;
          replacing.current = null;
          e.target.value = "";
          if (f && id) void replaceFile(id, f);
        }}
        hidden
      />
      {notice && <p className="cp-muted" role="status">{notice}</p>}

      {media.length > 0 && (
        <ul className="cp-media-list">
          {media.map((m, i) => {
            const u = uploads[m.id];
            const src = m.previewUrl ?? m.url ?? null;
            const unsent = !m.url && u?.status !== "uploading";
            return (
              <li key={m.id} className={`cp-media-card${u?.status === "error" || (unsent && !u) ? " flagged" : ""}`}>
                <div className="cp-media-thumb">
                  {m.kind === "image" && src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" />
                  ) : m.kind === "video" && (m.poster || src) ? (
                    m.poster ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.poster} alt="" />
                    ) : (
                      <video src={src ?? undefined} muted playsInline preload="metadata" />
                    )
                  ) : (
                    <span className="cp-media-none">No preview</span>
                  )}
                  {media.length > 1 && <span className="cp-media-index">{i + 1}</span>}
                </div>
                <div className="cp-media-meta">
                  <div className="cp-media-name" title={m.name}>{m.name}</div>
                  <dl>
                    <div><dt>Size</dt><dd className={m.size == null ? "cp-media-size-unknown" : ""} title={m.size == null ? "Not recorded" : undefined}>{fmtBytes(m.size)}</dd></div>
                    <div><dt>Resolution</dt><dd>{m.width && m.height ? `${m.width} × ${m.height}` : "–"}</dd></div>
                    <div><dt>Aspect</dt><dd>{aspectLabel(m.width, m.height)}</dd></div>
                    {m.kind === "video" && <div><dt>Length</dt><dd>{fmtDuration(m.duration)}</dd></div>}
                    <div><dt>Type</dt><dd title={m.mime ? undefined : "The browser did not report a type"}>{m.mime || "–"}</dd></div>
                  </dl>
                  <div className="cp-media-state">
                    {u?.status === "uploading" && <span className="cp-uploading"><Loader2 size={12} className="cp-spin" /> Uploading</span>}
                    {u?.status === "error" && <span className="cp-error-inline">{u.message}</span>}
                    {!u && !m.url && <span className="cp-error-inline">Not uploaded yet.</span>}
                    {m.url && u?.status !== "uploading" && <span className="cp-ok">Uploaded</span>}
                  </div>
                </div>
                <div className="cp-media-actions">
                  {media.length > 1 && (
                    <>
                      <button type="button" className="cp-icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={14} /></button>
                      <button type="button" className="cp-icon-btn" aria-label="Move down" disabled={i === media.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={14} /></button>
                    </>
                  )}
                  <button type="button" className="cp-icon-btn" aria-label="Replace" disabled={u?.status === "uploading"} onClick={() => { replacing.current = m.id; replaceRef.current?.click(); }}><RefreshCw size={14} /></button>
                  {u?.status === "error" && fileFor(m.id) && (
                    <button type="button" className="cp-link" onClick={() => { const f = fileFor(m.id); if (f) void upload(m, f); }}>Retry</button>
                  )}
                  <button type="button" className="cp-icon-btn danger" aria-label="Remove" onClick={() => remove(m)}><Trash2 size={14} /></button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {issues.length > 0 && (
        <div className="cp-issues">
          {issues.map((g) => (
            <div key={g.key} className="cp-issue-group">
              <div className="cp-issue-label">{g.label}</div>
              <ul>
                {g.items.map((i, n) => <li key={n} className={i.severity}>{i.message}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

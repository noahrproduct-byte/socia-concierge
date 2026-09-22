"use client";

// Instagram settings for one destination. Only fields the Content Publishing
// API accepts for accounts connected through Instagram Login; anything the API
// does not offer that way is named as unavailable instead of faked.

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { X } from "lucide-react";
import { CAPABILITIES } from "@/lib/publishing/capabilities";
import type { ComposerDraft, DraftDestination } from "@/lib/publishing/composer";
import type { InstagramFormat, InstagramSettings, MediaItem } from "@/lib/publishing/types";
import { fmtDuration, posterFrame, type MediaItemWithPreview } from "@/lib/publishing/mediaInfo";
import type { ComposerAction } from "../contracts";

/** The formats the capability model lists for Instagram, in its order; only implemented ones get a radio. */
const FORMATS = CAPABILITIES.instagram.formats.filter((f) => f.implemented);

function fitHint(format: InstagramFormat, media: MediaItem[]): string | null {
  if (!media.length) return null;
  const spec = CAPABILITIES.instagram.formats.find((f) => f.id === format);
  if (!spec) return null;
  const kinds = media.map((m) => m.kind);
  if (kinds.some((k) => !spec.media.kinds.includes(k))) return `Needs ${spec.media.kinds.join(" or ")} files.`;
  if (media.length < spec.media.minItems) return `Needs at least ${spec.media.minItems} images.`;
  if (media.length > spec.media.maxItems) return `Allows ${spec.media.maxItems === 1 ? "one file" : `up to ${spec.media.maxItems} items`}.`;
  return null;
}

export default function InstagramSettingsForm({
  dest, draft, dispatch, fileFor,
}: {
  dest: DraftDestination;
  draft: ComposerDraft;
  dispatch: (a: ComposerAction) => void;
  fileFor: (mediaId: string) => File | null;
}) {
  const s = dest.settings as InstagramSettings;
  const set = (patch: Partial<InstagramSettings>) => dispatch({ type: "set_settings", key: dest.key, settings: { ...s, ...patch } });
  const media = draft.media as MediaItemWithPreview[];
  const video = media.find((m) => m.kind === "video") ?? null;
  const firstImage = media.find((m) => m.kind === "image") ?? null;
  const altMax = CAPABILITIES.instagram.fields.altText?.max ?? 1000;
  const [tagInput, setTagInput] = useState("");

  return (
    <div className="cp-form" data-dest={dest.key}>
      <div className="cp-row" data-field="format">
        <span className="cp-label">Format</span>
        <div className="cp-radios">
          {FORMATS.map((spec) => {
            const f = spec.id as InstagramFormat;
            const hint = fitHint(f, media);
            return (
              <label key={f} className={`cp-radio${s.format === f ? " on" : ""}${hint ? " off" : ""}`}>
                <input type="radio" name={`ig-format-${dest.key}`} value={f} checked={s.format === f} disabled={Boolean(hint)} onChange={() => set({ format: f })} />
                <span>{spec.label}</span>
                {hint && <small>{hint}</small>}
              </label>
            );
          })}
        </div>
        <small className="cp-help">{CAPABILITIES.instagram.formats.find((x) => x.id === s.format)?.media.notes[0]}</small>
      </div>

      {s.format === "reel" && (
        <>
          <label className="cp-row cp-checkrow" data-field="shareToFeed">
            <input type="checkbox" checked={s.shareToFeed} onChange={(e) => set({ shareToFeed: e.target.checked })} />
            <span>Share to feed<small>Also show this Reel in your profile grid and followers&apos; feeds.</small></span>
          </label>
          <CoverPicker video={video} file={video ? fileFor(video.id) : null} valueMs={s.coverTimestampMs} onChange={(ms, poster) => {
            set({ coverTimestampMs: ms });
            if (video) dispatch({ type: "update_media", id: video.id, patch: { poster } as Partial<MediaItem> });
          }} />
        </>
      )}

      {s.format !== "reel" && (
        <div className="cp-row" data-field="altText">
          <span className="cp-label">Alt text <em>{[...(s.altText ?? "")].length} / {altMax}</em></span>
          <textarea
            className="cp-input"
            rows={2}
            value={s.altText ?? ""}
            onChange={(e) => set({ altText: e.target.value || null })}
            placeholder={s.format === "carousel" ? "Describes the first image for screen readers." : "Describe the image for screen readers."}
          />
        </div>
      )}

      <div className="cp-row" data-field="userTags">
        <span className="cp-label">Tag people</span>
        <div className="cp-chips">
          {s.userTags.map((t, i) => (
            <span key={`${t.username}-${i}`} className="cp-chip">
              @{t.username}
              {s.format === "image" && (t.x == null || t.y == null) && <small>place on image</small>}
              <button type="button" aria-label={`Remove ${t.username}`} onClick={() => set({ userTags: s.userTags.filter((_, n) => n !== i) })}><X size={11} /></button>
            </span>
          ))}
          <input
            className="cp-chip-input"
            value={tagInput}
            placeholder="username, then Enter"
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== ",") return;
              e.preventDefault();
              const u = tagInput.trim().replace(/^@/, "");
              if (!u || s.userTags.some((t) => t.username === u)) { setTagInput(""); return; }
              set({ userTags: [...s.userTags, { username: u }] });
              setTagInput("");
            }}
          />
        </div>
        {s.format === "image" && firstImage && s.userTags.length > 0 && (
          <TagPlacer image={firstImage} tags={s.userTags} onPlace={(i, x, y) => set({ userTags: s.userTags.map((t, n) => (n === i ? { ...t, x, y } : t)) })} />
        )}
        {s.format === "image" && !firstImage && s.userTags.length > 0 && <small className="cp-help">Add the image to place the tags on it.</small>}
        {s.format === "carousel" && s.userTags.length > 0 && <small className="cp-help">Tags on carousels are placed on the first image at its centre.</small>}
        {s.format === "reel" && <small className="cp-help">On Reels, tagged people are listed without a position.</small>}
      </div>

      <label className="cp-row cp-checkrow" data-field="aiGenerated">
        <input type="checkbox" checked={s.aiGenerated} onChange={(e) => set({ aiGenerated: e.target.checked })} />
        <span>This content is AI-generated<small>Instagram labels the post as AI-generated.</small></span>
      </label>

      <p className="cp-muted">{CAPABILITIES.instagram.notes[1]} {CAPABILITIES.instagram.notes[2]}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CoverPicker({
  video, file, valueMs, onChange,
}: {
  video: MediaItemWithPreview | null;
  file: File | null;
  valueMs: number | null;
  onChange: (ms: number | null, poster: string | null) => void;
}) {
  const durationMs = video?.duration != null ? Math.floor(video.duration * 1000) : null;
  const measured = durationMs != null;
  const [local, setLocal] = useState<number>(valueMs ?? 0);
  const [poster, setPoster] = useState<string | null>(video?.poster ?? null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Only a scrubber move writes coverTimestampMs; rendering the preview frame never does. */
  const touched = useRef(false);
  const src = useMemo(() => file ?? video?.url ?? video?.previewUrl ?? null, [file, video]);

  useEffect(() => { setLocal(valueMs ?? 0); }, [valueMs]);

  useEffect(() => {
    if (!src) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBusy(true);
      const p = await posterFrame(src, local / 1000);
      setPoster(p);
      setBusy(false);
      // An unmeasured video keeps whatever was stored (usually null): 0 would claim a choice nobody made.
      onChange(measured && touched.current ? local : valueMs, p);
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, src]);

  if (!video) return <div className="cp-row" data-field="coverTimestampMs"><span className="cp-label">Cover frame</span><small className="cp-help">Add the video to choose a cover frame.</small></div>;

  return (
    <div className="cp-row" data-field="coverTimestampMs">
      <span className="cp-label">Cover frame <em>{measured ? fmtDuration(local / 1000) : "not measured"}</em></span>
      <div className="cp-cover">
        <div className="cp-cover-frame">
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="" />
          ) : (
            <span className="cp-media-none">{busy ? "Rendering" : "No frame yet"}</span>
          )}
        </div>
        {durationMs != null ? (
          <input
            type="range"
            min={0}
            max={Math.max(0, durationMs - 100)}
            step={100}
            value={Math.min(local, Math.max(0, durationMs - 100))}
            onChange={(e) => { touched.current = true; setLocal(Number(e.target.value)); }}
            aria-label="Cover frame time"
          />
        ) : (
          <small className="cp-help">The video length was not measured, so the scrubber is unavailable. Instagram uses the first frame.</small>
        )}
      </div>
    </div>
  );
}

function TagPlacer({
  image, tags, onPlace,
}: {
  image: MediaItemWithPreview;
  tags: InstagramSettings["userTags"];
  onPlace: (index: number, x: number, y: number) => void;
}) {
  const [active, setActive] = useState<number>(() => Math.max(0, tags.findIndex((t) => t.x == null || t.y == null)));
  const src = image.previewUrl ?? image.url;
  const place = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onPlace(active, Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000);
    const next = tags.findIndex((t, i) => i !== active && (t.x == null || t.y == null));
    if (next >= 0) setActive(next);
  };
  if (!src) return null;
  return (
    <div className="cp-tagger">
      <small className="cp-help">Click the image to place <strong>@{tags[active]?.username ?? tags[0].username}</strong>. Pick a name to move it.</small>
      <div className="cp-tagger-img" onClick={place} role="button" tabIndex={0} aria-label="Place tag">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} />
        {tags.map((t, i) => t.x != null && t.y != null ? (
          <span key={i} className={`cp-tag-pin${i === active ? " on" : ""}`} style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}>@{t.username}</span>
        ) : null)}
      </div>
      <div className="cp-tagger-names">
        {tags.map((t, i) => (
          <button key={i} type="button" className={`cp-tag-name${i === active ? " on" : ""}`} onClick={() => setActive(i)}>
            @{t.username}{t.x == null || t.y == null ? " (unplaced)" : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

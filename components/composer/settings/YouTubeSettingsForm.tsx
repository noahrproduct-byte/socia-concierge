"use client";

// YouTube settings for one destination: the fields videos.insert accepts.
// Categories and playlists come from the channel itself; when the token lacks
// the scope the form says so and links the reconnect, it never guesses a list.

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, X } from "lucide-react";
import { CAPABILITIES } from "@/lib/publishing/capabilities";
import type { ComposerDraft, DraftDestination } from "@/lib/publishing/composer";
import type { YouTubePrivacy, YouTubeSettings } from "@/lib/publishing/types";
import { byteLength } from "@/lib/publishing/validate";
import type { MediaItemWithPreview } from "@/lib/publishing/mediaInfo";
import type { ComposerAction } from "../contracts";

type Opt = { id: string; title: string };
type Options = { playlists: Opt[]; categories: Opt[]; categoriesNote: string | null };
type OptionsState = { status: "loading" } | { status: "ready"; data: Options } | { status: "needs_scope" } | { status: "error"; message: string };

const LANGUAGES: [string, string][] = [
  ["en", "English"], ["es", "Spanish"], ["pt", "Portuguese"], ["fr", "French"], ["de", "German"], ["it", "Italian"], ["nl", "Dutch"],
  ["tr", "Turkish"], ["ar", "Arabic"], ["hi", "Hindi"], ["ur", "Urdu"], ["id", "Indonesian"], ["ja", "Japanese"], ["ko", "Korean"], ["zh", "Chinese"], ["ru", "Russian"],
];

function normalize(list: unknown): Opt[] {
  if (!Array.isArray(list)) return [];
  return list.map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const id = String(o.id ?? o.value ?? "");
    const title = String(o.title ?? o.name ?? o.label ?? id);
    return id ? { id, title } : null;
  }).filter((x): x is Opt => Boolean(x));
}

let cached: Options | null = null;

export default function YouTubeSettingsForm({
  dest, draft, dispatch,
}: {
  dest: DraftDestination;
  draft: ComposerDraft;
  dispatch: (a: ComposerAction) => void;
}) {
  const s = dest.settings as YouTubeSettings;
  const set = (patch: Partial<YouTubeSettings>) => dispatch({ type: "set_settings", key: dest.key, settings: { ...s, ...patch } });
  const caps = CAPABILITIES.youtube;
  const titleMax = caps.fields.title?.max ?? 100;
  const descMax = caps.fields.description?.maxBytes ?? 5000;
  const tagsMax = caps.fields.tags?.maxTotalChars ?? 500;
  const [opts, setOpts] = useState<OptionsState>(cached ? { status: "ready", data: cached } : { status: "loading" });
  const [tagInput, setTagInput] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const images = (draft.media as MediaItemWithPreview[]).filter((m) => m.kind === "image");
  const customDesc = s.description != null;
  const tagChars = s.tags.reduce((n, t) => n + (t.includes(" ") ? t.length + 2 : t.length) + 1, 0);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/publishing/youtube/options");
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          if (j?.code === "needs_scope" || res.status === 401 && j?.code) setOpts({ status: "needs_scope" });
          else setOpts({ status: "error", message: typeof j?.error === "string" ? j.error : "YouTube did not return the channel's options." });
          return;
        }
        if (j?.code === "needs_scope") { setOpts({ status: "needs_scope" }); return; }
        const data = { playlists: normalize(j.playlists), categories: normalize(j.categories), categoriesNote: typeof j.categoriesNote === "string" ? j.categoriesNote : null };
        cached = data;
        setOpts({ status: "ready", data });
      } catch {
        if (!cancelled) setOpts({ status: "error", message: "YouTube could not be reached to load categories and playlists." });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const addTag = () => {
    const t = tagInput.trim().replace(/,+$/, "");
    if (!t) { setTagInput(""); return; }
    if (!s.tags.includes(t)) set({ tags: [...s.tags, t] });
    setTagInput("");
  };

  return (
    <div className="cp-form" data-dest={dest.key}>
      <div className="cp-row" data-field="title">
        <span className="cp-label">Title <em className={[...s.title].length > titleMax ? "over" : ""}>{[...s.title].length} / {titleMax}</em></span>
        <input
          className="cp-input"
          value={s.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Required by YouTube"
          aria-required
        />
        {caps.fields.title?.forbiddenChars && <small className="cp-help">Cannot contain {caps.fields.title.forbiddenChars.join(" or ")}.</small>}
      </div>

      <div className="cp-row" data-field="description">
        <span className="cp-label">
          Description
          <em className={byteLength(s.description ?? draft.masterCaption) > descMax ? "over" : ""}>{byteLength(s.description ?? draft.masterCaption)} / {descMax} bytes</em>
        </span>
        {customDesc ? (
          <textarea className="cp-input" rows={5} value={s.description ?? ""} onChange={(e) => set({ description: e.target.value })} placeholder="Description for YouTube" />
        ) : (
          <div className="cp-ghost">{draft.masterCaption.trim() ? draft.masterCaption : "Your general caption will be used as the description."}</div>
        )}
        <label className="cp-checkrow inline">
          <input type="checkbox" checked={customDesc} onChange={(e) => set({ description: e.target.checked ? (s.description ?? draft.masterCaption) : null })} />
          <span>Write a different description</span>
        </label>
      </div>

      <div className="cp-row" data-field="tags">
        <span className="cp-label">Tags <em className={tagChars > tagsMax ? "over" : ""}>{tagChars} / {tagsMax}</em></span>
        <div className="cp-chips">
          {s.tags.map((t) => (
            <span key={t} className="cp-chip">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => set({ tags: s.tags.filter((x) => x !== t) })}><X size={11} /></button></span>
          ))}
          <input
            className="cp-chip-input"
            value={tagInput}
            placeholder="tag, then Enter"
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
            onBlur={addTag}
          />
        </div>
        <small className="cp-help">Search keywords, separate from the #hashtags in the description.</small>
      </div>

      <div className="cp-row cp-two">
        <div data-field="categoryId">
          <span className="cp-label">Category</span>
          {opts.status === "ready" ? (
            <select className="cp-input" value={s.categoryId ?? ""} onChange={(e) => set({ categoryId: e.target.value || null })}>
              <option value="">YouTube default</option>
              {opts.data.categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          ) : <OptionsFallback state={opts} what="categories" />}
          {opts.status === "ready" && opts.data.categoriesNote && <small className="cp-help">{opts.data.categoriesNote}</small>}
        </div>
        <div data-field="playlistId">
          <span className="cp-label">Playlist</span>
          {opts.status === "ready" ? (
            <select className="cp-input" value={s.playlistId ?? ""} onChange={(e) => set({ playlistId: e.target.value || null })}>
              <option value="">None</option>
              {opts.data.playlists.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          ) : <OptionsFallback state={opts} what="playlists" />}
        </div>
      </div>

      <div className="cp-row" data-field="privacy">
        <span className="cp-label">Visibility</span>
        <div className="cp-radios">
          {(["public", "unlisted", "private"] as YouTubePrivacy[]).map((p) => (
            <label key={p} className={`cp-radio${s.privacy === p ? " on" : ""}`}>
              <input type="radio" name={`yt-privacy-${dest.key}`} checked={s.privacy === p} onChange={() => set({ privacy: p })} />
              <span>{p[0].toUpperCase() + p.slice(1)}</span>
            </label>
          ))}
        </div>
        <small className="cp-help cp-note">{caps.notes[1]}</small>
      </div>

      <div className="cp-row cp-prominent" data-field="madeForKids">
        <span className="cp-label">Audience</span>
        <div className="cp-radios stack">
          <label className={`cp-radio${s.madeForKids === true ? " on" : ""}`}>
            <input type="radio" name={`yt-kids-${dest.key}`} checked={s.madeForKids === true} onChange={() => set({ madeForKids: true })} />
            <span>Yes, it&apos;s made for kids</span>
          </label>
          <label className={`cp-radio${s.madeForKids === false ? " on" : ""}`}>
            <input type="radio" name={`yt-kids-${dest.key}`} checked={s.madeForKids === false} onChange={() => set({ madeForKids: false })} />
            <span>No, it&apos;s not made for kids</span>
          </label>
        </div>
        {s.madeForKids == null && <small className="cp-help warn">YouTube requires this answer before a video can be uploaded.</small>}
      </div>

      <label className="cp-row cp-checkrow" data-field="syntheticMedia">
        <input type="checkbox" checked={s.syntheticMedia} onChange={(e) => set({ syntheticMedia: e.target.checked })} />
        <span>Altered or synthetic content<small>Tell viewers when realistic scenes, voices or people were made or changed with AI or other tools.</small></span>
      </label>

      <div className="cp-row" data-field="thumbnailMediaId">
        <span className="cp-label">Thumbnail</span>
        {images.length === 0 ? (
          <small className="cp-help">Add an image to the media section to use it as the thumbnail; otherwise YouTube picks one.</small>
        ) : (
          <div className="cp-thumbs">
            <button type="button" className={`cp-thumb${s.thumbnailMediaId == null ? " on" : ""}`} onClick={() => set({ thumbnailMediaId: null })}>
              <span className="cp-media-none">YouTube&apos;s choice</span>
            </button>
            {images.map((m) => (
              <button key={m.id} type="button" className={`cp-thumb${s.thumbnailMediaId === m.id ? " on" : ""}`} onClick={() => set({ thumbnailMediaId: m.id })} aria-label={`Use ${m.name} as thumbnail`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.previewUrl ?? m.url ?? ""} alt="" />
              </button>
            ))}
          </div>
        )}
        <small className="cp-help">{caps.notes[2]}</small>
      </div>

      <button type="button" className="cp-disclosure" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}>
        {advanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Advanced
      </button>
      {advanced && (
        <div className="cp-advanced">
          <label className="cp-checkrow" data-field="notifySubscribers">
            <input type="checkbox" checked={s.notifySubscribers} onChange={(e) => set({ notifySubscribers: e.target.checked })} />
            <span>Notify subscribers</span>
          </label>
          <label className="cp-checkrow" data-field="embeddable">
            <input type="checkbox" checked={s.embeddable} onChange={(e) => set({ embeddable: e.target.checked })} />
            <span>Allow embedding</span>
          </label>
          <div className="cp-two">
            <div data-field="license">
              <span className="cp-label">License</span>
              <select className="cp-input" value={s.license} onChange={(e) => set({ license: e.target.value as YouTubeSettings["license"] })}>
                <option value="youtube">Standard YouTube License</option>
                <option value="creativeCommon">Creative Commons, Attribution</option>
              </select>
            </div>
            <div data-field="recordingDate">
              <span className="cp-label">Recording date</span>
              <input className="cp-input" type="date" value={s.recordingDate ?? ""} onChange={(e) => set({ recordingDate: e.target.value || null })} />
            </div>
          </div>
          <div data-field="language">
            <span className="cp-label">Language</span>
            <select className="cp-input" value={s.language ?? ""} onChange={(e) => set({ language: e.target.value || null })}>
              <option value="">Not set</option>
              {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

function OptionsFallback({ state, what }: { state: OptionsState; what: string }) {
  if (state.status === "loading") return <div className="cp-ghost"><Loader2 size={12} className="cp-spin" /> Loading {what} from your channel</div>;
  if (state.status === "needs_scope") return <div className="cp-ghost"><a href="/api/auth/youtube/start?publish=1">Enable YouTube uploads</a> to load {what}.</div>;
  if (state.status === "error") return <div className="cp-ghost">{state.message}</div>;
  return null;
}

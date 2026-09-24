"use client";

// TikTok settings for one destination: the post_info fields the Content
// Posting API accepts. Visibility options come from TikTok's creator_info for
// this account (never a hard-coded list). When the grant only allows inbox
// upload, the interaction fields are shown as informational: TikTok asks for
// them again in the app.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { CAPABILITIES } from "@/lib/publishing/capabilities";
import type { ComposerDraft, DraftDestination } from "@/lib/publishing/composer";
import type { MediaItem, TikTokSettings } from "@/lib/publishing/types";
import type { MediaItemWithPreview } from "@/lib/publishing/mediaInfo";
import type { ComposerAction } from "../contracts";
import { CoverPicker } from "./InstagramSettingsForm";

type Creator = {
  direct: boolean;
  privacyOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxDurationSec: number | null;
};
type CreatorState = { status: "loading" } | { status: "ready"; data: Creator } | { status: "error"; message: string };

const PRIVACY_LABEL: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

let cached: Creator | null = null;

export default function TikTokSettingsForm({
  dest, draft, dispatch, fileFor,
}: {
  dest: DraftDestination;
  draft: ComposerDraft;
  dispatch: (a: ComposerAction) => void;
  fileFor: (mediaId: string) => File | null;
}) {
  const s = dest.settings as TikTokSettings;
  const set = (patch: Partial<TikTokSettings>) => dispatch({ type: "set_settings", key: dest.key, settings: { ...s, ...patch } });
  const caps = CAPABILITIES.tiktok;
  const media = draft.media as MediaItemWithPreview[];
  const video = media.find((m) => m.kind === "video") ?? null;
  const [creator, setCreator] = useState<CreatorState>(cached ? { status: "ready", data: cached } : { status: "loading" });
  const customCaption = s.caption != null;
  const captionMax = caps.formats[0].caption.max;
  const captionLen = [...(s.caption ?? draft.masterCaption)].length;

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/publishing/tiktok/creator", { cache: "no-store" });
        const j = (await res.json().catch(() => null)) as Partial<Creator> & { error?: string } | null;
        if (cancelled) return;
        if (!res.ok || !j) { setCreator({ status: "error", message: j?.error || "TikTok's posting options could not be loaded." }); return; }
        const data: Creator = {
          direct: Boolean(j.direct),
          privacyOptions: Array.isArray(j.privacyOptions) ? j.privacyOptions : [],
          commentDisabled: Boolean(j.commentDisabled),
          duetDisabled: Boolean(j.duetDisabled),
          stitchDisabled: Boolean(j.stitchDisabled),
          maxDurationSec: typeof j.maxDurationSec === "number" ? j.maxDurationSec : null,
        };
        cached = data;
        setCreator({ status: "ready", data });
      } catch {
        if (!cancelled) setCreator({ status: "error", message: "TikTok's posting options could not be loaded." });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const direct = creator.status === "ready" && creator.data.direct;
  const tooLong = creator.status === "ready" && creator.data.maxDurationSec != null && video?.duration != null && video.duration > creator.data.maxDurationSec;

  return (
    <div className="cp-form">
      {creator.status === "ready" && !creator.data.direct && (
        <p className="cp-muted cp-note">{caps.notes[0]}</p>
      )}

      <div className="cp-row" data-field="caption">
        <span className="cp-label">
          Caption
          <em className={captionLen > captionMax ? "over" : ""}>{captionLen} / {captionMax}</em>
        </span>
        {customCaption ? (
          <textarea className="cp-input" rows={4} value={s.caption ?? ""} onChange={(e) => set({ caption: e.target.value })} placeholder="Caption for TikTok" />
        ) : (
          <div className="cp-ghost">{draft.masterCaption.trim() ? draft.masterCaption : "Your general caption will be used."}</div>
        )}
        <label className="cp-checkrow inline">
          <input type="checkbox" checked={customCaption} onChange={(e) => set({ caption: e.target.checked ? (s.caption ?? draft.masterCaption) : null })} />
          <span>Write a different caption</span>
        </label>
        {creator.status === "ready" && !creator.data.direct && (
          <small className="cp-help">Inbox uploads do not carry a caption; you paste it in the TikTok app. It is kept here so the post reads the same everywhere.</small>
        )}
      </div>

      <div className="cp-row" data-field="privacy">
        <span className="cp-label">Who can see it</span>
        {creator.status === "loading" ? (
          <small className="cp-help"><Loader2 size={12} className="spin" /> Loading TikTok&apos;s options…</small>
        ) : creator.status === "error" ? (
          <small className="cp-help warn">{creator.message}</small>
        ) : !creator.data.direct ? (
          <small className="cp-help">Chosen in the TikTok app when you post the draft.</small>
        ) : creator.data.privacyOptions.length === 0 ? (
          <small className="cp-help warn">TikTok did not offer any visibility for this account.</small>
        ) : (
          <>
            <div className="cp-radios">
              {creator.data.privacyOptions.map((p) => (
                <label key={p} className={`cp-radio${s.privacy === p ? " on" : ""}`}>
                  <input type="radio" name={`tt-privacy-${dest.key}`} checked={s.privacy === p} onChange={() => set({ privacy: p })} />
                  <span>{PRIVACY_LABEL[p] ?? p}</span>
                </label>
              ))}
            </div>
            {s.privacy == null && <small className="cp-help warn">TikTok requires a visibility before a video can be posted.</small>}
            <small className="cp-help cp-note">{caps.notes[1]}</small>
          </>
        )}
      </div>

      {direct && (
        <div className="cp-row" data-field="interactions">
          <span className="cp-label">Interactions</span>
          <label className="cp-checkrow inline">
            <input type="checkbox" checked={s.allowComments} disabled={creator.status === "ready" && creator.data.commentDisabled} onChange={(e) => set({ allowComments: e.target.checked })} />
            <span>Allow comments</span>
          </label>
          <label className="cp-checkrow inline">
            <input type="checkbox" checked={s.allowDuet} disabled={creator.status === "ready" && creator.data.duetDisabled} onChange={(e) => set({ allowDuet: e.target.checked })} />
            <span>Allow Duet</span>
          </label>
          <label className="cp-checkrow inline">
            <input type="checkbox" checked={s.allowStitch} disabled={creator.status === "ready" && creator.data.stitchDisabled} onChange={(e) => set({ allowStitch: e.target.checked })} />
            <span>Allow Stitch</span>
          </label>
          {creator.status === "ready" && (creator.data.commentDisabled || creator.data.duetDisabled || creator.data.stitchDisabled) && (
            <small className="cp-help">Greyed options are switched off in this account&apos;s TikTok settings.</small>
          )}
        </div>
      )}

      {direct && (
        <CoverPicker video={video} file={video ? fileFor(video.id) : null} valueMs={s.coverTimestampMs} onChange={(ms, poster) => {
          set({ coverTimestampMs: ms });
          if (video) dispatch({ type: "update_media", id: video.id, patch: { poster } as Partial<MediaItem> });
        }} />
      )}

      {direct && (
        <div className="cp-row" data-field="disclosure">
          <span className="cp-label">Content disclosure</span>
          <label className="cp-checkrow inline">
            <input type="checkbox" checked={s.brandOrganic} onChange={(e) => set({ brandOrganic: e.target.checked })} />
            <span>Promotes my own brand or business</span>
          </label>
          <label className="cp-checkrow inline">
            <input type="checkbox" checked={s.brandContent} onChange={(e) => set({ brandContent: e.target.checked })} />
            <span>Paid partnership (branded content)</span>
          </label>
          {s.brandContent && s.privacy === "SELF_ONLY" && <small className="cp-help warn">Branded content cannot be posted as Only me.</small>}
          {(s.brandContent || s.brandOrganic) && (
            <small className="cp-help">
              By posting, you agree to TikTok&apos;s {s.brandContent ? <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">Branded Content Policy</a> : null}{s.brandContent && s.brandOrganic ? " and " : ""}{s.brandOrganic ? <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a> : null}.
            </small>
          )}
        </div>
      )}

      <label className="cp-row cp-checkrow" data-field="aiGenerated">
        <input type="checkbox" checked={s.aiGenerated} onChange={(e) => set({ aiGenerated: e.target.checked })} />
        <span>AI-generated content<small>TikTok labels the video as AI-generated.</small></span>
      </label>

      {tooLong && creator.status === "ready" && (
        <small className="cp-help warn">This TikTok account can post videos up to {Math.floor((creator.data.maxDurationSec ?? 0) / 60)} minutes long.</small>
      )}
      <p className="cp-muted">{caps.formats[0].media.notes[0]}</p>
    </div>
  );
}

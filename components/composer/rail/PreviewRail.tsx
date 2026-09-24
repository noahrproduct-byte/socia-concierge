"use client";

// Approximate preview per enabled destination. Instagram: a phone frame with
// the first media and the caption's first two lines. YouTube: a video card
// with the chosen thumbnail (or the first media), the title and the channel.
// Facebook and TikTok cannot be enabled, so nothing is drawn for them.

import { useState } from "react";
import type { RailProps } from "@/components/composer/contracts";
import { captionFor, enabledDestinations, type DraftDestination, type PickerAccount } from "@/lib/publishing/composer";
import { PLATFORM_LABEL, type InstagramSettings, type MediaItem, type YouTubeSettings } from "@/lib/publishing/types";
import { PlatformMark } from "./ReadinessPanel";

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function accountFor(d: DraftDestination, accounts: PickerAccount[]): PickerAccount | null {
  return accounts.find((a) => a.platform === d.platform && a.accountId === d.accountId) ?? null;
}

function Media({ m, className }: { m: MediaItem | null; className?: string }) {
  if (!m) return <div className={`cr-ph${className ? ` ${className}` : ""}`}>No media yet</div>;
  if (!m.url) return <div className={`cr-ph${className ? ` ${className}` : ""}`}>{m.name}<br />Preview appears once the upload finishes</div>;
  if (m.kind === "video") return <video src={m.url} muted playsInline preload="metadata" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={m.url} alt="" />;
}

function InstagramPreview({ d, draft, account }: { d: DraftDestination; draft: RailProps["draft"]; account: PickerAccount | null }) {
  const s = d.settings as InstagramSettings;
  const first = draft.media[0] ?? null;
  const handle = account?.handle ? `@${account.handle.replace(/^@/, "")}` : account?.label ?? "Instagram";
  const lines = captionFor(draft, d).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 2);
  const carousel = s.format === "carousel" && draft.media.length > 1;
  return (
    <div className="cr-phone" aria-label="Instagram preview">
      <div className="cr-phone-top">
        <span className="cr-avatar">
          {account?.avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.avatar} alt="" />
          )}
        </span>
        {handle}
      </div>
      <div className={`cr-phone-media${s.format !== "reel" ? " is-image" : ""}`}>
        <Media m={first} />
        {carousel && (
          <>
            <span className="cr-count">1/{draft.media.length}</span>
            <div className="cr-dots" aria-hidden="true">
              {draft.media.map((m, i) => <i key={m.id} className={i === 0 ? "on" : ""} />)}
            </div>
          </>
        )}
      </div>
      <div className="cr-phone-cap">
        {lines.length ? (
          lines.map((l, i) => (
            <p key={i}>{i === 0 && <strong>{handle}</strong>}{l}</p>
          ))
        ) : (
          <p><strong>{handle}</strong><span className="cr-warn-text">Caption required</span></p>
        )}
      </div>
    </div>
  );
}

function YouTubePreview({ d, draft, account }: { d: DraftDestination; draft: RailProps["draft"]; account: PickerAccount | null }) {
  const s = d.settings as YouTubeSettings;
  const first = draft.media[0] ?? null;
  const thumb = s.thumbnailMediaId ? draft.media.find((m) => m.id === s.thumbnailMediaId && m.kind === "image" && m.url) ?? null : null;
  const title = s.title.trim();
  return (
    <div className="cr-yt" aria-label="YouTube preview">
      <div className="cr-yt-thumb">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb.url!} alt="" />
        ) : first?.url ? (
          <Media m={first} />
        ) : (
          <div className="cr-ph dark">{first ? "Preview appears once the upload finishes" : "No video yet"}</div>
        )}
        {first?.kind === "video" && first.duration != null && <span className="cr-yt-dur">{fmtDur(first.duration)}</span>}
      </div>
      <div className="cr-yt-meta">
        <span className="cr-avatar">
          {account?.avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.avatar} alt="" />
          )}
        </span>
        <div>
          <p className={`cr-yt-title${title ? "" : " cr-warn-text"}`}>{title || "Title required"}</p>
          <small>{account?.label ?? "YouTube"}</small>
        </div>
      </div>
    </div>
  );
}

export default function PreviewRail({ draft, accounts }: RailProps) {
  const enabled = enabledDestinations(draft).filter((d) => d.platform === "instagram" || d.platform === "youtube");
  const [selected, setSelected] = useState<string | null>(null);
  const active = enabled.find((d) => d.key === selected) ?? enabled[0] ?? null;

  return (
    <section className="ov-card cr-card" aria-labelledby="cr-preview-h">
      <div className="ov-card-head">
        <h2 id="cr-preview-h">Preview</h2>
      </div>
      {!active ? (
        <p className="cr-empty">Choose a destination to see how the post will look.</p>
      ) : (
        <>
          {enabled.length > 1 && (
            <div className="cr-tabs" role="tablist" aria-label="Preview destination">
              {enabled.map((d) => {
                const a = accountFor(d, accounts);
                return (
                  <button
                    key={d.key}
                    type="button"
                    role="tab"
                    aria-selected={d.key === active.key}
                    className={`cr-tab${d.key === active.key ? " on" : ""}`}
                    onClick={() => setSelected(d.key)}
                  >
                    <PlatformMark platform={d.platform} size={12} />
                    {PLATFORM_LABEL[d.platform]}
                    <small>{a?.label ?? d.accountId}</small>
                  </button>
                );
              })}
            </div>
          )}
          {/* Keyed so switching platform remounts the frame and the crossfade fires. */}
          <div key={active.key} className="cr-preview-stage">
            {active.platform === "instagram" ? (
              <InstagramPreview d={active} draft={draft} account={accountFor(active, accounts)} />
            ) : (
              <YouTubePreview d={active} draft={draft} account={accountFor(active, accounts)} />
            )}
          </div>
          <small className="cr-note">Preview is approximate; each platform renders differently.</small>
        </>
      )}
    </section>
  );
}

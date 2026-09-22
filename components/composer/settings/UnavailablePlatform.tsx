"use client";

// A platform SOCIA cannot publish to yet. Says why, in the capability model's
// own words, and offers nothing to click: a fake control would be a lie.

import { CAPABILITIES } from "@/lib/publishing/capabilities";
import type { Platform } from "@/lib/publishing/types";
import { PlatformMark } from "../DestinationPicker";

export default function UnavailablePlatform({ platform, reason }: { platform: Platform; reason?: string | null }) {
  const caps = CAPABILITIES[platform];
  const notes = reason && !caps.notes.includes(reason) ? [reason, ...caps.notes] : caps.notes;
  return (
    <div className="cp-unavailable" role="status">
      <div className="cp-unavailable-head">
        <PlatformMark platform={platform} />
        <strong>{caps.label}</strong>
        <span className="cp-tag">Not available</span>
      </div>
      {notes.map((n) => <p key={n}>{n}</p>)}
    </div>
  );
}

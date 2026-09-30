"use client";

// Section 3, General tab: the master caption every destination inherits, with
// live counts against the strictest enabled limit and a quiet row of SOCIA
// actions. Every AI result is a draft the person picks; nothing is ever
// written into the caption without a click.

import { useCallback, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import PlanNotice, { UsageLine } from "@/components/PlanNotice";
import { askSocia } from "@/lib/ask";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import { CAPABILITIES, formatSpec } from "@/lib/publishing/capabilities";
import { enabledDestinations, type ComposerDraft } from "@/lib/publishing/composer";
import { PLATFORM_LABEL, type DestinationSettings, type Platform } from "@/lib/publishing/types";
import { byteLength, countHashtags, countMentions, formatIdFor } from "@/lib/publishing/validate";
import type { ComposerAction } from "./contracts";

type Option = { label: string; text: string; steps?: string[] };
type Usage = { used: number | null; limit: number; resetsOn?: string | null } | null;
type Result = { task: "caption" | "hooks" | "optimize"; platform: Platform | null; options: Option[] };

/**
 * The strictest hashtag and mention caps among the enabled destinations, from
 * the capability model. null = no enabled destination documents a cap.
 */
export function tagCaps(draft: ComposerDraft): { hashtags: number | null; mentions: number | null } {
  let hashtags: number | null = null;
  let mentions: number | null = null;
  for (const d of enabledDestinations(draft)) {
    const rule = formatSpec(d.platform, formatIdFor(d.platform, d.settings))?.caption;
    if (!rule) continue;
    if (rule.maxHashtags != null && (hashtags == null || rule.maxHashtags < hashtags)) hashtags = rule.maxHashtags;
    if (rule.maxMentions != null && (mentions == null || rule.maxMentions < mentions)) mentions = rule.maxMentions;
  }
  return { hashtags, mentions };
}

export function captionLimit(draft: ComposerDraft): { max: number; unit: "chars" | "bytes"; platform: Platform } | null {
  let best: { max: number; unit: "chars" | "bytes"; platform: Platform } | null = null;
  for (const d of enabledDestinations(draft)) {
    const fmt = formatSpec(d.platform, formatIdFor(d.platform, d.settings));
    if (!fmt) continue;
    if (!best || fmt.caption.max < best.max) best = { max: fmt.caption.max, unit: fmt.caption.unit, platform: d.platform };
  }
  return best;
}

export function studioKind(draft: ComposerDraft): { kind: "video" | "image" | "carousel"; durationSec: number | null } {
  const video = draft.media.find((m) => m.kind === "video");
  if (video) return { kind: "video", durationSec: video.duration };
  if (draft.media.length >= 2) return { kind: "carousel", durationSec: null };
  return { kind: "image", durationSec: null };
}

export async function improve(body: Record<string, unknown>): Promise<{ options: Option[]; usage: Usage }> {
  const res = await fetch("/api/studio/improve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (isPlanError(json)) throw new ImproveFailure(json.error, json);
    throw new ImproveFailure(json.error ?? "SOCIA could not generate options.", null);
  }
  const usage = json.usage && typeof json.usage.limit === "number" ? { used: json.usage.used ?? null, limit: json.usage.limit, resetsOn: json.usage.resetsOn ?? null } : null;
  return { options: Array.isArray(json.options) ? json.options : [], usage };
}

export class ImproveFailure extends Error {
  plan: PlanError | null;
  constructor(message: string, plan: PlanError | null) {
    super(message);
    this.plan = plan;
  }
}

/** Replace the first line (the hook) and keep the rest of the caption. */
export function withHook(caption: string, hook: string): string {
  const lines = caption.split("\n");
  if (!caption.trim()) return hook;
  lines[0] = hook;
  return lines.join("\n");
}

export default function MasterContent({
  draft, dispatch,
}: {
  draft: ComposerDraft;
  dispatch: (a: ComposerAction) => void;
}) {
  const caption = draft.masterCaption;
  const limit = captionLimit(draft);
  const chars = [...caption].length;
  const len = limit?.unit === "bytes" ? byteLength(caption) : chars;
  const over = limit ? len > limit.max : false;
  const hashtags = countHashtags(caption);
  const mentions = countMentions(caption);
  const caps = tagCaps(draft);
  const enabled = enabledDestinations(draft);
  const platforms = useMemo(() => Array.from(new Set(enabled.map((d) => d.platform))), [enabled]);

  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [perPlatform, setPerPlatform] = useState<{ platform: Platform; options: Option[] }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const [usage, setUsage] = useState<Usage>(null);

  const base = useCallback(() => {
    const k = studioKind(draft);
    return { caption, summary: caption, kind: k.kind, durationSec: k.durationSec };
  }, [caption, draft]);

  const run = useCallback(async (task: "caption" | "hooks", extra: Record<string, unknown> = {}) => {
    const { generate, ...rest } = extra;
    setBusy(task === "hooks" ? "hook" : generate ? "generate" : "caption");
    setError(null);
    setPlanError(null);
    try {
      const r = await improve({ task, ...base(), ...rest, ...(generate && !caption.trim() ? { mode: "written from scratch for this post" } : {}) });
      setUsage(r.usage);
      setPerPlatform(null);
      setResult({ task, platform: null, options: r.options });
    } catch (e) {
      if (e instanceof ImproveFailure && e.plan) setPlanError(e.plan);
      else setError(e instanceof Error ? e.message : "SOCIA could not generate options.");
    } finally {
      setBusy(null);
    }
  }, [base]);

  const optimize = useCallback(async () => {
    setBusy("optimize");
    setError(null);
    setPlanError(null);
    const out: { platform: Platform; options: Option[] }[] = [];
    try {
      for (const p of platforms) {
        const label = PLATFORM_LABEL[p];
        const r = await improve({ task: "caption", ...base(), mode: `written for ${label}`, styles: [label] });
        setUsage(r.usage);
        out.push({ platform: p, options: r.options });
        setPerPlatform([...out]);
      }
      setResult(null);
    } catch (e) {
      if (e instanceof ImproveFailure && e.plan) setPlanError(e.plan);
      else setError(e instanceof Error ? e.message : "SOCIA could not generate options.");
      if (out.length) setPerPlatform(out);
    } finally {
      setBusy(null);
    }
  }, [base, platforms]);

  const useForPlatform = (platform: Platform, text: string) => {
    for (const d of enabled.filter((x) => x.platform === platform)) {
      const s = d.settings as DestinationSettings & { caption?: string | null; description?: string | null };
      const next = platform === "youtube" ? { ...s, description: text } : { ...s, caption: text };
      dispatch({ type: "set_settings", key: d.key, settings: next as DestinationSettings });
    }
    if (!draft.customizePerPlatform) dispatch({ type: "toggle_customize", on: true });
  };

  const ask = () => {
    const k = studioKind(draft);
    askSocia({
      context: { page: "studio", studio: { kind: k.kind, durationSec: k.durationSec, goal: null, transcript: null, caption: caption || null, summary: null } },
      contextLabel: "This post",
    });
  };

  return (
    <div className="cp-master">
      <textarea
        className="cp-textarea"
        data-field="caption"
        rows={6}
        value={caption}
        onChange={(e) => dispatch({ type: "set_caption", caption: e.target.value })}
        placeholder="First line is the hook. Hashtags go at the end."
        aria-label="Caption"
      />
      <div className="cp-counts">
        <span className={over ? "over" : ""}>
          {limit ? `${len} / ${limit.max}${limit.unit === "bytes" ? " bytes" : ""}` : `${chars} characters`}
          {limit && <small> {PLATFORM_LABEL[limit.platform]} limit</small>}
        </span>
        <span className={caps.hashtags != null && hashtags > caps.hashtags ? "over" : ""}>
          {hashtags} {hashtags === 1 ? "hashtag" : "hashtags"}{caps.hashtags != null && <small> of {caps.hashtags}</small>}
        </span>
        <span className={caps.mentions != null && mentions > caps.mentions ? "over" : ""}>
          {mentions} {mentions === 1 ? "mention" : "mentions"}{caps.mentions != null && <small> of {caps.mentions}</small>}
        </span>
      </div>

      <div className="cp-actions">
        <button type="button" className="cp-action" onClick={ask}><Sparkles size={13} /> Ask SOCIA</button>
        <button type="button" className="cp-action" disabled={busy !== null} onClick={() => run("caption", { generate: true })}>
          {busy === "generate" ? <Loader2 size={13} className="cp-spin" /> : null} Generate caption
        </button>
        <button type="button" className="cp-action" disabled={busy !== null || !caption.trim()} onClick={() => run("caption")}>
          {busy === "caption" ? <Loader2 size={13} className="cp-spin" /> : null} Improve caption
        </button>
        <button type="button" className="cp-action" disabled={busy !== null || !caption.trim()} onClick={() => run("hooks")}>
          {busy === "hook" ? <Loader2 size={13} className="cp-spin" /> : null} Improve hook
        </button>
        {enabled.length >= 2 && (
          <button type="button" className="cp-action" disabled={busy !== null || !caption.trim()} onClick={optimize}>
            {busy === "optimize" ? <Loader2 size={13} className="cp-spin" /> : null} Optimize for each platform
          </button>
        )}
        {usage && <UsageLine meter="content_generation" used={usage.used} limit={usage.limit} resetsOn={usage.resetsOn} className="cp-usage" />}
      </div>

      {planError && <PlanNotice error={planError} compact />}
      {error && <p className="cp-error" role="alert">{error}</p>}

      {result && result.options.length > 0 && (
        <div className="cp-suggest">
          <div className="cp-suggest-head">
            <span>{result.task === "hooks" ? "Hook options" : "Caption options"}</span>
            <button type="button" className="cp-link" onClick={() => setResult(null)}>Dismiss</button>
          </div>
          {result.options.map((o, i) => (
            <div key={i} className="cp-suggest-item">
              <div className="cp-suggest-text">
                <small>{o.label}</small>
                <p>{o.text}</p>
              </div>
              <button
                type="button"
                className="btn-secondary cp-use"
                onClick={() => dispatch({ type: "set_caption", caption: result.task === "hooks" ? withHook(caption, o.text) : o.text })}
              >
                Use
              </button>
            </div>
          ))}
        </div>
      )}

      {perPlatform && perPlatform.length > 0 && (
        <div className="cp-suggest">
          <div className="cp-suggest-head">
            <span>Drafts per platform</span>
            <button type="button" className="cp-link" onClick={() => setPerPlatform(null)}>Dismiss</button>
          </div>
          {perPlatform.map((group) => (
            <div key={group.platform} className="cp-suggest-group">
              <div className="cp-suggest-group-head">{PLATFORM_LABEL[group.platform]}</div>
              {group.options.length === 0 && <p className="cp-muted">No draft came back for {PLATFORM_LABEL[group.platform]}.</p>}
              {group.options.map((o, i) => (
                <div key={i} className="cp-suggest-item">
                  <div className="cp-suggest-text">
                    <small>{o.label}</small>
                    <p>{o.text}</p>
                  </div>
                  <button type="button" className="btn-secondary cp-use" onClick={() => useForPlatform(group.platform, o.text)}>
                    Use for {PLATFORM_LABEL[group.platform]}
                  </button>
                </div>
              ))}
            </div>
          ))}
          {busy === "optimize" && <p className="cp-muted"><Loader2 size={12} className="cp-spin" /> Writing the next platform&apos;s draft.</p>}
        </div>
      )}

      {enabled.some((d) => d.platform === "youtube") && (
        <p className="cp-muted">{CAPABILITIES.youtube.label} uses this text as the description; the title is set in its settings.</p>
      )}
    </div>
  );
}

"use client";

// Generate Caption: SOCIA looks at the post (frames, sound, what's said),
// adds what it has verified about the brand (locations, collaborators, the
// plan or Studio cut, what worked before) and writes the caption. The result
// shows SOCIA's read of the post and what it was built from, so the person
// can see why it says what it says; nothing is written into the caption
// without a click. Refinements rewrite the same caption with the same facts.

import { useCallback, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import PlanNotice from "@/components/PlanNotice";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import { enabledDestinations, type ComposerDraft } from "@/lib/publishing/composer";
import { seeMedia, type SeePhase, type Seen } from "@/lib/publishing/captionMedia";
import { countHashtags } from "@/lib/publishing/validate";
import { PLATFORM_LABEL, type InstagramSettings, type Platform } from "@/lib/publishing/types";
import type { ComposerAction } from "./contracts";

type Action = "generate" | "regenerate" | "shorten" | "engaging" | "professional" | "cta" | "hashtags";
type Parts = { hook: string; body: string; cta: string; hashtags: string[] };
type Caption = { target: string; platforms: Platform[]; text: string; parts: Parts; warnings: string[] };
type Fact = { source: string; text: string };
export type CaptionUsage = { used: number | null; limit: number; resetsOn?: string | null } | null;
type Result = { understanding: string; purpose: string; captions: Caption[]; facts: Fact[]; gaps: string[]; seenNotes: string[]; heard: boolean };

const PHASE_COPY: Record<SeePhase | "writing", string> = {
  seeing: "Looking at your media",
  listening: "Listening to the sound",
  transcribing: "Transcribing what's said",
  writing: "Writing with what SOCIA knows about this brand",
};

const ACTION_COPY: Partial<Record<Action, string>> = {
  regenerate: "Writing a different take",
  shorten: "Shortening",
  engaging: "Making it more engaging",
  professional: "Making it more professional",
  cta: "Changing the ask",
  hashtags: "Choosing new hashtags",
};

const CTA_GOALS = ["Come in and visit", "Comment with an answer", "Save it for later", "Share it or tag a friend", "Follow for more", "Send us a DM", "Book or reserve", "Order"];

const SOURCE_LABEL: Record<string, string> = {
  brand: "Brand", location: "Location", account: "Account", people: "People", plan: "Plan",
  studio: "Studio", performance: "Past posts", notes: "Your notes", draft: "Your caption",
};

export default function CaptionGenerator({
  draft, dispatch, userId, fileFor, onInsert, onUsage,
}: {
  draft: ComposerDraft;
  dispatch: (a: ComposerAction) => void;
  userId: string;
  fileFor: (mediaId: string) => File | null;
  /** put text into the caption box at the cursor */
  onInsert: (text: string) => void;
  onUsage: (u: CaptionUsage) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [seen, setSeen] = useState<Seen | null>(null);
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [ctaOpen, setCtaOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const enabled = enabledDestinations(draft);
  const caption = draft.masterCaption;

  const run = useCallback(async (action: Action, extra: { ctaGoal?: string } = {}) => {
    setError(null); setPlanError(null); setCtaOpen(false); setApplied(null);
    setBusy(action === "generate" ? "seeing" : ACTION_COPY[action] ?? "writing");
    try {
      let s = seen;
      if (action === "generate" || !s) {
        s = await seeMedia(draft.media, { userId, fileFor, onPhase: (p) => setBusy(p) });
        setSeen(s);
      }
      if (action === "generate") setBusy("writing");
      const ig = enabled.filter((d) => d.platform === "instagram").map((d) => d.settings as InstagramSettings);
      const res = await fetch("/api/publishing/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          postId: draft.postId,
          destinations: enabled.map((d) => ({ platform: d.platform, accountId: d.accountId })),
          perPlatform: draft.customizePerPlatform && enabled.length > 0,
          draft: caption,
          notes,
          collaborators: Array.from(new Set(ig.flatMap((x) => x.collaborators ?? []))),
          userTags: Array.from(new Set(ig.flatMap((x) => (x.userTags ?? []).map((t) => t.username)))),
          planId: draft.planId,
          planDay: draft.planDay,
          media: { kind: s.kind, count: s.count, durationSec: s.durationSec },
          frames: action === "generate" ? s.frames : [],
          frameTimes: action === "generate" ? s.frameTimes : [],
          imageUrls: action === "generate" ? s.imageUrls : [],
          transcript: s.transcript,
          audio: s.audio,
          understanding: result?.understanding,
          purpose: result?.purpose,
          current: action === "generate" ? [] : result?.captions.map((c) => ({ target: c.target, ...c.parts })) ?? [],
          ctaGoal: extra.ctaGoal,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (isPlanError(json)) setPlanError(json);
        else setError(json.error ?? "SOCIA couldn't write a caption right now.");
        return;
      }
      if (json.usage && typeof json.usage.limit === "number") onUsage({ used: json.usage.used ?? null, limit: json.usage.limit, resetsOn: json.usage.resetsOn ?? null });
      setResult({
        understanding: json.understanding ?? "",
        purpose: json.purpose ?? "",
        captions: Array.isArray(json.captions) ? json.captions : [],
        facts: Array.isArray(json.facts) ? json.facts : [],
        gaps: Array.isArray(json.gaps) ? json.gaps : [],
        seenNotes: s.notes,
        heard: Boolean(s.transcript),
      });
    } catch {
      setError("SOCIA couldn't write a caption right now. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }, [caption, draft.customizePerPlatform, draft.media, draft.planDay, draft.planId, draft.postId, enabled, fileFor, notes, onUsage, result, seen, userId]);

  const useFor = (c: Caption) => {
    for (const d of enabled.filter((x) => c.platforms.includes(x.platform))) {
      const s = d.settings as typeof d.settings & { caption?: string | null; description?: string | null };
      const next = d.platform === "youtube" ? { ...s, description: c.text } : { ...s, caption: c.text };
      dispatch({ type: "set_settings", key: d.key, settings: next as typeof d.settings });
    }
    if (!draft.customizePerPlatform) dispatch({ type: "toggle_customize", on: true });
  };

  const useAll = () => {
    for (const c of result?.captions ?? []) useFor(c);
    if (!caption.trim() && result?.captions[0]) dispatch({ type: "set_caption", caption: result.captions[0].text });
    setApplied("all");
  };

  const working = busy !== null;
  const perPlatform = (result?.captions.length ?? 0) > 1 || result?.captions[0]?.target !== "all";

  return (
    <div className="cg">
      <div className="cg-start">
        <button type="button" className="cp-action cg-go" disabled={working} onClick={() => void run("generate")}>
          {busy && !result ? <Loader2 size={13} className="cp-spin" /> : <Sparkles size={13} />} {result ? "Generate again" : "Generate caption"}
        </button>
        <button type="button" className="cp-link" onClick={() => setNotesOpen((o) => !o)} aria-expanded={notesOpen}>
          {notesOpen ? "Hide notes" : notes.trim() ? "Edit what SOCIA should know" : "Anything SOCIA should know?"}
        </button>
      </div>
      {notesOpen && (
        <textarea
          className="cp-textarea cg-notes"
          rows={2}
          value={notes}
          maxLength={1200}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="The offer, a price, a date, who's in it. SOCIA only uses facts it's given."
          aria-label="What SOCIA should know about this post"
        />
      )}

      {busy && <p className="cp-muted cg-busy" role="status"><Loader2 size={12} className="cp-spin" /> {PHASE_COPY[busy as SeePhase | "writing"] ?? busy}…</p>}
      {planError && <PlanNotice error={planError} compact />}
      {error && <p className="cp-error" role="alert">{error}</p>}

      {result && result.captions.length > 0 && (
        <div className="cg-result" aria-busy={working}>
          <div className="cg-head">
            <span>SOCIA&apos;s read</span>
            <button type="button" className="cp-link" onClick={() => setResult(null)}>Dismiss</button>
          </div>
          {result.understanding && <p className="cg-read">{result.understanding}</p>}
          {result.purpose && <p className="cg-purpose"><b>Goal</b> {result.purpose}</p>}
          {result.seenNotes.length > 0 && <p className="cp-muted">{result.seenNotes.join(" ")}</p>}

          {result.captions.map((c) => {
            const label = c.target === "all" ? null : PLATFORM_LABEL[c.target as Platform];
            const chars = [...c.text].length;
            return (
              <div key={c.target} className="cg-card">
                {label && <div className="cg-card-head">{label}</div>}
                <p className="cg-text">{c.text}</p>
                <div className="cg-meta">
                  <span>{chars} characters</span>
                  <span>{countHashtags(c.text)} {countHashtags(c.text) === 1 ? "hashtag" : "hashtags"}</span>
                </div>
                {c.warnings.map((w) => (
                  <p key={w} className="cg-warn"><AlertTriangle size={12} /> {w}</p>
                ))}
                <div className="cg-use">
                  {c.target === "all" ? (
                    caption.trim() ? (
                      <>
                        <button type="button" className="btn-primary sm" onClick={() => { dispatch({ type: "set_caption", caption: c.text }); setApplied(c.target); }}>Replace caption</button>
                        <button type="button" className="btn-secondary sm" onClick={() => { onInsert(c.text); setApplied(c.target); }}>Insert at cursor</button>
                      </>
                    ) : (
                      <button type="button" className="btn-primary sm" onClick={() => { dispatch({ type: "set_caption", caption: c.text }); setApplied(c.target); }}>Use caption</button>
                    )
                  ) : (
                    <button type="button" className="btn-primary sm" onClick={() => { useFor(c); setApplied(c.target); }}>Use for {label}</button>
                  )}
                  {applied === c.target && <span className="cp-ok">Added.</span>}
                </div>
              </div>
            );
          })}
          {perPlatform && result.captions.length > 1 && (
            <div className="cg-use">
              <button type="button" className="btn-secondary sm" onClick={useAll}>Use all {result.captions.length}</button>
              {applied === "all" && <span className="cp-ok">Each platform has its own caption now.</span>}
            </div>
          )}

          <div className="cp-actions cg-refine">
            <button type="button" className="cp-action" disabled={working} onClick={() => void run("regenerate")}><RefreshCw size={12} /> Regenerate</button>
            <button type="button" className="cp-action" disabled={working} onClick={() => void run("shorten")}>Shorten</button>
            <button type="button" className="cp-action" disabled={working} onClick={() => void run("engaging")}>More engaging</button>
            <button type="button" className="cp-action" disabled={working} onClick={() => void run("professional")}>More professional</button>
            <button type="button" className="cp-action" disabled={working} aria-expanded={ctaOpen} onClick={() => setCtaOpen((o) => !o)}>Change CTA</button>
            <button type="button" className="cp-action" disabled={working} onClick={() => void run("hashtags")}>New hashtags</button>
          </div>
          {ctaOpen && (
            <div className="cg-ctas" role="group" aria-label="What should the post ask people to do?">
              {CTA_GOALS.map((g) => (
                <button key={g} type="button" className="cg-chip" disabled={working} onClick={() => void run("cta", { ctaGoal: g })}>{g}</button>
              ))}
            </div>
          )}

          {(result.facts.length > 0 || result.heard) && (
            <div className="cg-facts">
              <span className="cg-facts-label">Built from</span>
              {result.heard && <span className="cg-fact"><small>Video</small> What&apos;s said in it</span>}
              {result.facts.map((f, i) => (
                <span key={`${f.source}-${i}`} className="cg-fact"><small>{SOURCE_LABEL[f.source] ?? f.source}</small> {f.text}</span>
              ))}
            </div>
          )}
          {result.gaps.length > 0 && (
            <details className="cg-gaps">
              <summary>What SOCIA didn&apos;t know, so left out ({result.gaps.length})</summary>
              <ul>{result.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

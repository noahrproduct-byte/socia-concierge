"use client";

// Create Post: the client page. Owns the draft through useComposer, lays out
// the left column (destinations, media, content, settings) and hands the right
// rail its props. Desktop is two columns, tablet one, phone a five-step flow.

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import PlanNotice from "@/components/PlanNotice";
import { PreviewRail, ReadinessPanel, PrePublishCheck, SchedulingPanel, ReviewPublish, PublishingStatus } from "@/components/composer/rail";
import { enabledDestinations, readinessFor, type DraftDestination } from "@/lib/publishing/composer";
import { PLATFORM_LABEL, type DestinationSettings } from "@/lib/publishing/types";
import { byteLength, formatIdFor } from "@/lib/publishing/validate";
import { formatSpec } from "@/lib/publishing/capabilities";
import type { ComposerPageProps, RailProps } from "./contracts";
import { useComposer, MIGRATION_SENTENCE } from "./useComposer";
import DestinationPicker, { accountFor } from "./DestinationPicker";
import MediaSection from "./MediaSection";
import MasterContent from "./MasterContent";
import PlatformTabs, { GENERAL_TAB, tabsFor } from "./PlatformTabs";
import InstagramSettingsForm from "./settings/InstagramSettingsForm";
import YouTubeSettingsForm from "./settings/YouTubeSettingsForm";
import TikTokSettingsForm from "./settings/TikTokSettingsForm";
import UnavailablePlatform from "./settings/UnavailablePlatform";
import "./composer.css";

const STEPS = ["Destinations", "Media", "Content", "Settings", "Schedule"] as const;
const MOBILE_QUERY = "(max-width: 719px)";

function useMobile(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

/** Which step a readiness field lives on (phone flow). */
function stepForField(field: string): number {
  if (field === "destinations") return 0;
  if (field === "media") return 1;
  if (field === "caption" || field === "description") return 2;
  if (field === "scheduledAt") return 4;
  return 3;
}

export default function ComposerPage(props: ComposerPageProps & { postId?: string | null }) {
  const { accounts, accountsComplete, timing, canPublish, planError, ready, userId } = props;
  const c = useComposer(props);
  const { draft, dispatch, submission } = c;
  const quick = draft.mode === "quick";
  const mobile = useMobile();
  const [activeTab, setActiveTab] = useState<string>(GENERAL_TAB);
  const [step, setStep] = useState(0);

  const tabs = useMemo(() => tabsFor(draft, accounts), [draft, accounts]);
  const tab = tabs.some((t) => t.key === activeTab) ? activeTab : GENERAL_TAB;
  const activeDest: DraftDestination | null = tab === GENERAL_TAB ? null : draft.destinations.find((d) => d.key === tab) ?? null;
  const enabled = enabledDestinations(draft);
  const tracking = submission.phase === "tracking" || submission.phase === "done";

  // Living progress: each left section reports done, and the first not-done one
  // is active. The head shows a check instead of a number and the active card
  // gets a restrained accent. Deterministic; nothing here scrolls the user.
  const sectionDone = [
    enabled.length > 0,
    draft.media.length > 0 && draft.media.every((m) => m.url),
    draft.masterCaption.trim().length > 0,
    enabled.length > 0 && enabled.every((d) => readinessFor(draft, d, accounts).level !== "blocked"),
  ];
  const activeSection = sectionDone.findIndex((d) => !d);
  const secState = (i: number): SecState => (sectionDone[i] ? "done" : i === activeSection ? "active" : "todo");

  // Focus requests from the rail: switch tab / step, then focus the field.
  useEffect(() => {
    const f = c.focusRequest;
    if (!f) return;
    if (f.key && f.field !== "media" && f.field !== "caption" && f.field !== "destinations" && f.field !== "scheduledAt") setActiveTab(f.key);
    if (f.field === "description" && f.key) setActiveTab(f.key);
    if (mobile && !quick) setStep(stepForField(f.field));
    const t = setTimeout(() => {
      const scoped = f.key ? document.querySelector<HTMLElement>(`[data-dest="${f.key}"] [data-field="${f.field}"]`) : null;
      const el = scoped ?? document.querySelector<HTMLElement>(`[data-field="${f.field}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = el.matches("input,textarea,select") ? el : el.querySelector<HTMLElement>("input:not([hidden]),textarea,select,[tabindex]");
      input?.focus({ preventScroll: true });
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.focusRequest]);

  const rail: RailProps = {
    draft, accounts, dispatch, timing, submission,
    onSubmit: c.submit, onRetry: c.retry, onEdit: c.backToEditing, onFocusField: c.focusField,
  };

  if (!ready) {
    return (
      <div className="cp">
        <div className="ov-card cp-notice" role="status">
          <h2>Not ready on this server yet</h2>
          <p>{MIGRATION_SENTENCE}</p>
        </div>
      </div>
    );
  }

  const saving = submission.phase === "saving";
  const saveLabel = saving || c.saveState.status === "saving" ? "Saving" : c.saveState.status === "saved" && c.saveState.at ? "Saved" : "Save draft";

  const header = (
    <div className="cp-head">
      <div className="cal2-seg" role="tablist" aria-label="Composer mode">
        <button type="button" role="tab" aria-selected={quick} className={quick ? "on" : ""} onClick={() => dispatch({ type: "set_mode", mode: "quick" })}>Quick post</button>
        <button type="button" role="tab" aria-selected={!quick} className={!quick ? "on" : ""} onClick={() => dispatch({ type: "set_mode", mode: "advanced" })}>Advanced</button>
      </div>
      <div className="cp-head-right">
        {c.saveState.status === "error" && c.saveState.message && <span className="cp-error-inline">{c.saveState.message}</span>}
        <button type="button" className="btn-secondary" disabled={saving || tracking} onClick={() => void c.submit("draft")}>
          {saving ? <Loader2 size={13} className="cp-spin" /> : null} {saveLabel}
        </button>
      </div>
    </div>
  );

  const restoreBar = c.restore && (
    <div className="cp-restore" role="status">
      <span>Restore your unsaved post? A newer copy from this browser was saved {relTime(c.restore.savedAt)}.</span>
      <span className="cp-restore-actions">
        <button type="button" className="btn-primary sm" onClick={c.restore.accept}>Restore</button>
        <button type="button" className="btn-secondary sm" onClick={c.restore.dismiss}>Discard</button>
      </span>
    </div>
  );

  // The rail's ReviewPublish shows submission.error; on the phone flow the rail is only on the last step.
  const errorLine = mobile && !quick && step < STEPS.length - 1 && submission.phase === "error" && submission.error && (
    <p className="cp-error" role="alert">{submission.error}</p>
  );
  const planLine = !canPublish && planError && <PlanNotice error={planError} compact />;

  if (c.loading) {
    return (
      <div className="cp">
        {header}
        <div className="ov-card cp-notice"><Loader2 size={14} className="cp-spin" /> Loading your post.</div>
      </div>
    );
  }

  // ---- sections -----------------------------------------------------------------
  const sectionDestinations = (n: number | null, st: SecState = "todo") => (
    <section className={secClass(st)} aria-labelledby="cp-s1">
      <SectionHead n={n} st={st} id="cp-s1" title="Post to" sub="Only accounts SOCIA can publish to right now have a checkbox." />
      <DestinationPicker draft={draft} accounts={accounts} accountsComplete={accountsComplete} dispatch={dispatch} />
    </section>
  );
  const sectionMedia = (n: number | null, st: SecState = "todo") => (
    <section className={secClass(st)} aria-labelledby="cp-s2">
      <SectionHead n={n} st={st} id="cp-s2" title="Add media" sub="Measured in your browser; anything not measured is checked at upload." />
      <MediaSection draft={draft} accounts={accounts} dispatch={dispatch} userId={userId} registerFile={c.registerFile} fileFor={c.fileFor} ensurePostId={c.ensurePostId} />
    </section>
  );
  const sectionContent = (n: number | null, st: SecState = "todo") => (
    <section className={secClass(st)} aria-labelledby="cp-s3">
      <SectionHead
        n={n} st={st} id="cp-s3" title="Write your content"
        right={
          !quick && (
            <label className="cp-switch">
              <input type="checkbox" checked={draft.customizePerPlatform} onChange={(e) => dispatch({ type: "toggle_customize", on: e.target.checked })} />
              <span>Customize for each platform</span>
            </label>
          )
        }
      />
      {!quick && <PlatformTabs draft={draft} accounts={accounts} active={tab} onChange={setActiveTab} />}
      {quick || !activeDest ? (
        <MasterContent draft={draft} dispatch={dispatch} userId={userId} fileFor={c.fileFor} />
      ) : (
        <CaptionOverride dest={activeDest} draft={draft} dispatch={dispatch} />
      )}
    </section>
  );
  const sectionSettings = (n: number | null, st: SecState = "todo") => (
    <section className={secClass(st)} aria-labelledby="cp-s4">
      <SectionHead n={n} st={st} id="cp-s4" title="Platform settings" sub={activeDest ? `${PLATFORM_LABEL[activeDest.platform]}${accountFor(activeDest, accounts)?.label ? ` · ${accountFor(activeDest, accounts)!.label}` : ""}` : undefined} />
      {activeDest ? (
        activeDest.platform === "instagram" ? <InstagramSettingsForm dest={activeDest} draft={draft} dispatch={dispatch} fileFor={c.fileFor} />
        : activeDest.platform === "youtube" ? <YouTubeSettingsForm dest={activeDest} draft={draft} dispatch={dispatch} />
        : activeDest.platform === "tiktok" ? <TikTokSettingsForm dest={activeDest} draft={draft} dispatch={dispatch} fileFor={c.fileFor} />
        : <UnavailablePlatform platform={activeDest.platform} />
      ) : enabled.length === 0 ? (
        <p className="cp-muted">Choose where to post in step 1; each platform&apos;s settings appear here.</p>
      ) : (
        <ul className="cp-settings-list">
          {enabled.map((d) => (
            <li key={d.key}>
              <span>{PLATFORM_LABEL[d.platform]}{accountFor(d, accounts)?.handle ? <small> @{accountFor(d, accounts)!.handle!.replace(/^@/, "")}</small> : null}</span>
              <button type="button" className="btn-secondary sm" onClick={() => setActiveTab(d.key)}>Open {PLATFORM_LABEL[d.platform]} settings</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const status = <PublishingStatus {...rail} onNew={c.startNew} />;
  const reviewCard = <ReviewPublish {...rail} accountsComplete={accountsComplete} />;
  // The rail is one command panel, not five detached cards: the children keep
  // their own headings but the panel supplies the surface and internal dividers.
  const railFull = tracking ? (
    <div className="cp-command cp-command-live">{status}</div>
  ) : (
    <div className="cp-command">
      <PreviewRail {...rail} />
      <ReadinessPanel {...rail} />
      <PrePublishCheck {...rail} />
      {planLine}
      <SchedulingPanel {...rail} />
      {reviewCard}
    </div>
  );

  // ---- quick mode ---------------------------------------------------------------
  if (quick) {
    return (
      <div className="cp cp-quick">
        {header}
        {restoreBar}
        {tracking ? status : (
          <>
            {sectionDestinations(null)}
            {sectionMedia(null)}
            {sectionContent(null)}
            <div className="cp-command cp-inline-rail">
              {planLine}
              <SchedulingPanel {...rail} />
              {reviewCard}
            </div>
            <p className="cp-muted center">
              Need per-platform captions, covers or YouTube settings? <button type="button" className="cp-link" onClick={() => dispatch({ type: "set_mode", mode: "advanced" })}>Switch to Advanced</button>
            </p>
          </>
        )}
      </div>
    );
  }

  // ---- phone: step flow -----------------------------------------------------------
  if (mobile) {
    const last = STEPS.length - 1;
    return (
      <div className="cp cp-mobile">
        {header}
        {restoreBar}
        {errorLine}
        {tracking ? status : (
          <>
            <ol className="cp-steps" aria-label="Steps">
              {STEPS.map((s, i) => (
                <li key={s} className={i === step ? "on" : i < step ? "done" : ""}>
                  <button type="button" onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined}>
                    <b>{i + 1}</b><span>{s}</span>
                  </button>
                </li>
              ))}
            </ol>
            {step === 0 && sectionDestinations(1)}
            {step === 1 && sectionMedia(2)}
            {step === 2 && sectionContent(3)}
            {step === 3 && sectionSettings(4)}
            {step === 4 && <div className="cp-rail">{railFull}</div>}
            <div className="cp-step-nav">
              <button type="button" className="btn-secondary" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}><ChevronLeft size={14} /> Back</button>
              {step < last && <button type="button" className="btn-primary" onClick={() => setStep((s) => Math.min(last, s + 1))}>Next <ChevronRight size={14} /></button>}
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- desktop and tablet -----------------------------------------------------------
  return (
    <div className="cp">
      {header}
      {restoreBar}
      <div className="cp-grid">
        <div className="cp-main">
          {sectionDestinations(1, secState(0))}
          {sectionMedia(2, secState(1))}
          {sectionContent(3, secState(2))}
          {sectionSettings(4, secState(3))}
        </div>
        <aside className="cp-rail">{railFull}</aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type SecState = "todo" | "active" | "done";

/** Section surface + progress state class. Active and done get the accent/recede treatment in composer.css. */
function secClass(st: SecState): string {
  return `ov-card cp-section${st === "active" ? " is-active" : st === "done" ? " is-done" : ""}`;
}

function SectionHead({ n, st = "todo", id, title, sub, right }: { n: number | null; st?: SecState; id: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="cp-section-head">
      <div>
        <h2 id={id}>
          {n != null && (
            <span className={`cp-num${st === "done" ? " done" : ""}`} aria-hidden>
              {st === "done" ? <Check size={13} strokeWidth={3} className="cp-num-check" /> : n}
            </span>
          )}
          {title}
        </h2>
        {sub && <p className="cp-section-sub">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** A platform tab's caption override: empty means "inherit the general caption". */
function CaptionOverride({ dest, draft, dispatch }: { dest: DraftDestination; draft: ReturnType<typeof useComposer>["draft"]; dispatch: RailProps["dispatch"] }) {
  const isYt = dest.platform === "youtube";
  const s = dest.settings as DestinationSettings & { caption?: string | null; description?: string | null };
  const value = (isYt ? s.description : s.caption) ?? "";
  const fmt = formatSpec(dest.platform, formatIdFor(dest.platform, dest.settings));
  const len = fmt?.caption.unit === "bytes" ? byteLength(value) : [...value].length;
  const write = (text: string) => {
    const next = isYt ? { ...s, description: text || null } : { ...s, caption: text || null };
    dispatch({ type: "set_settings", key: dest.key, settings: next as DestinationSettings });
    if (text && !draft.customizePerPlatform) dispatch({ type: "toggle_customize", on: true });
  };
  return (
    <div className="cp-master" data-dest={dest.key}>
      <textarea
        className="cp-textarea"
        data-field={isYt ? "description" : "caption"}
        rows={6}
        value={value}
        onChange={(e) => write(e.target.value)}
        placeholder="Uses your general caption"
        aria-label={`${PLATFORM_LABEL[dest.platform]} ${isYt ? "description" : "caption"}`}
      />
      <div className="cp-counts">
        <span className={fmt && len > fmt.caption.max ? "over" : ""}>
          {fmt ? `${len} / ${fmt.caption.max}${fmt.caption.unit === "bytes" ? " bytes" : ""}` : `${len} characters`}
        </span>
        {!value && <span>Inheriting the general caption</span>}
        {!draft.customizePerPlatform && value && <span>Turn on &quot;Customize for each platform&quot; to use this text</span>}
      </div>
      {value && <button type="button" className="cp-link" onClick={() => write("")}>Use the general caption instead</button>}
    </div>
  );
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return "a moment ago";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

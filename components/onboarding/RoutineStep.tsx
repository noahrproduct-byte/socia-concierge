"use client";

// Onboarding, "Your routine": SIO asks how the person really makes content,
// one question at a time (Noah's SIO brief, 2026-11-16). Posting days a week,
// filming days and time, how they like to work, what they make, when they
// publish. Each answer is saved with the brand as soon as the person moves on
// (brand_detail.growth.routine, lib/routine.ts), so leaving and coming back
// picks up at the first question without an answer. Nothing is preselected:
// an answer here is always one the person gave.
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  CONTENT_FORMATS, CREATION_STYLES, FILM_TIMES, MAX_FILM_MINUTES, POST_DAYS, PUBLISH_MODES, ROUTINE_QUESTIONS, WEEKDAYS,
  answered, filmTime, firstUnanswered, postDaysNote,
  type ContentFormat, type CreationStyle, type PublishMode, type Routine, type RoutineQuestion, type Weekday,
} from "@/lib/routine";
import { Field, Input } from "@/components/system";
import { Choices } from "@/components/growth/GrowthFields";
import SioSays from "@/components/sio/SioSays";
import type { SioExpression } from "@/components/sio/Sio";

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const dayName = (d: Weekday) => WEEKDAYS.find((x) => x.id === d)!.name;
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "");

const ASK: Record<RoutineQuestion, { title: string; sub: string }> = {
  post_days: { title: "How many days per week do you want to post?", sub: "Let's choose something you can realistically maintain." },
  filming: { title: "Which days work best for filming?", sub: "I'll organize your content around when you're actually free." },
  style: { title: "How do you like making content?", sub: "This shapes how I lay out your week." },
  formats: { title: "What kind of content do you create?", sub: "Pick everything that fits. I'll only suggest what you actually make." },
  publish: { title: "Do you have preferred posting days?", sub: "You can change this any time." },
};

/** What SIO says back about the answer just given, before the next question. */
function ackFor(q: RoutineQuestion, r: Routine): string | null {
  if (q === "post_days" && r.post_days) return `${r.post_days} ${r.post_days === 1 ? "day" : "days"} a week. Got it.`;
  if (q === "filming" && r.filming?.length) return `Filming on ${list(r.filming.map((s) => dayName(s.day)))}. Noted.`;
  if (q === "style" && r.style) return `${CREATION_STYLES.find((s) => s.id === r.style)!.label}. Noted.`;
  if (q === "formats" && r.formats?.length) return "Thanks. I'll plan around those.";
  return null;
}

export default function RoutineStep({
  initial,
  recentPerWeek,
  headRef,
  onBack,
  onDone,
  onSaved,
  startAtEnd = false,
}: {
  initial: Routine | null | undefined;
  /** Posts a week lately, read from the connected account; null when SOCIA couldn't read it. */
  recentPerWeek: number | null;
  headRef: React.RefObject<HTMLHeadingElement | null>;
  /** Back from the first question. */
  onBack: () => void;
  /** Every question answered and saved. */
  onDone: () => void;
  /** The routine as it now stands on the server, after each save. */
  onSaved: (r: Routine) => void;
  /** Coming back from the next step: open on the last question. */
  startAtEnd?: boolean;
}) {
  const [r, setR] = useState<Routine>(initial ?? {});
  const [q, setQ] = useState<RoutineQuestion>(() => (startAtEnd ? ROUTINE_QUESTIONS[ROUTINE_QUESTIONS.length - 1] : firstUnanswered(initial)));
  const [ack, setAck] = useState<string | null>(null);
  const [mood, setMood] = useState<SioExpression>("neutral");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [perDay, setPerDay] = useState(() => new Set((initial?.filming ?? []).map((s) => s.minutes)).size > 1);
  const [customTime, setCustomTime] = useState<Partial<Record<Weekday | "all", string>>>({});

  const i = ROUTINE_QUESTIONS.indexOf(q);
  useEffect(() => { headRef.current?.focus(); }, [q, headRef]);
  // SIO looks pleased for a moment after an answer, then waits again.
  useEffect(() => {
    if (mood !== "happy") return;
    const t = setTimeout(() => setMood("neutral"), 1600);
    return () => clearTimeout(t);
  }, [mood]);

  const patch = (p: Partial<Routine>) => { setR((cur) => ({ ...cur, ...p })); setErr(null); };
  const days = (r.filming ?? []).map((s) => s.day);
  const setDays = (next: Weekday[]) => {
    const keep = new Map((r.filming ?? []).map((s) => [s.day, s.minutes] as const));
    const shared = !perDay && r.filming?.length ? r.filming[0].minutes : 0;
    patch({ filming: WEEKDAYS.map((d) => d.id).filter((d) => next.includes(d)).map((d) => ({ day: d, minutes: keep.get(d) ?? shared })) });
  };
  const setTime = (day: Weekday | "all", minutes: number) =>
    patch({ filming: (r.filming ?? []).map((s) => (day === "all" || s.day === day ? { ...s, minutes } : s)) });
  const typedMinutes = (text: string): number | null => {
    const n = Math.round(Number(text.replace(/[^\d.]/g, "")));
    return Number.isFinite(n) && n > 0 && n <= MAX_FILM_MINUTES ? n : null;
  };

  /** What is missing from the current answer, in SIO's words, or null. */
  function missing(): string | null {
    if (q === "post_days") return r.post_days ? null : "Choose how many days a week you want to post.";
    if (q === "filming") {
      if (!r.filming?.length) return "Choose at least one day you can film.";
      const without = r.filming.filter((s) => !(s.minutes > 0));
      return without.length ? `Choose how much time you have${perDay ? ` on ${list(without.map((s) => dayName(s.day)))}` : ""}.` : null;
    }
    if (q === "style") return r.style ? null : "Choose the one that sounds most like you.";
    if (q === "formats") {
      if (!r.formats?.length) return "Pick at least one kind of content.";
      return answered("formats", r) ? null : "Say what your other content is, or untick Other.";
    }
    if (!r.publish_mode) return "Choose how you want your posting days decided.";
    return answered("publish", r) ? null : "Choose at least one posting day.";
  }

  async function next() {
    const problem = missing();
    if (problem) { setErr(problem); return; }
    setSaving(true);
    setErr(null);
    // The date the posting target was set travels with it, so a later change never rewrites earlier weeks.
    const changedTarget = r.post_days !== initial?.post_days || !r.post_days_since;
    const routine: Routine = { ...r, ...(q === "post_days" && changedTarget ? { post_days_since: new Date().toISOString().slice(0, 10) } : {}) };
    const res = await post("/api/profile", { brand_detail: { growth: { routine } } }).catch(() => null);
    setSaving(false);
    if (!res?.ok) { setErr("Couldn't save that. Try again."); return; }
    setR(routine);
    onSaved(routine);
    if (i === ROUTINE_QUESTIONS.length - 1) { onDone(); return; }
    setAck(ackFor(q, routine));
    setMood("happy");
    setQ(ROUTINE_QUESTIONS[i + 1]);
  }

  function back() {
    setErr(null);
    setAck(null);
    if (i === 0) onBack();
    else setQ(ROUTINE_QUESTIONS[i - 1]);
  }

  const shared = !perDay && r.filming?.length ? r.filming[0].minutes : 0;
  const timeOptions = [...FILM_TIMES.map((t) => ({ id: String(t.minutes), label: t.label })), { id: "custom", label: "Custom" }];
  const timeValue = (minutes: number, key: Weekday | "all") =>
    customTime[key] != null ? "custom" : FILM_TIMES.some((t) => t.minutes === minutes) ? String(minutes) : minutes > 0 ? "custom" : "";
  const timeRow = (key: Weekday | "all", label: string, minutes: number) => (
    <div key={key} className="obr-time">
      <Choices label={label} columns={4} options={timeOptions} value={timeValue(minutes, key)}
        onChange={(v) => {
          if (v === "custom") { setCustomTime((c) => ({ ...c, [key]: minutes > 0 ? String(minutes) : "" })); return; }
          setCustomTime((c) => { const n = { ...c }; delete n[key]; return n; });
          setTime(key, Number(v));
        }} />
      {timeValue(minutes, key) === "custom" && (
        <div className="gp-row">
          <Field label="Minutes" hint={minutes > 0 ? filmTime(minutes) : undefined}>
            <Input inputMode="numeric" value={customTime[key] ?? String(minutes || "")}
              onChange={(e) => { setCustomTime((c) => ({ ...c, [key]: e.target.value })); const m = typedMinutes(e.target.value); if (m) setTime(key, m); }} />
          </Field>
        </div>
      )}
    </div>
  );

  return (
    <>
      <SioSays expression={mood} title={ASK[q].title} headRef={headRef} ack={ack}>{ASK[q].sub}</SioSays>
      <p className="obr-count">Question {i + 1} of {ROUTINE_QUESTIONS.length}</p>

      <div className="ob-fields">
        {q === "post_days" && (
          <>
            <Choices label="Posting days a week" columns={3} options={POST_DAYS.map((n) => ({ id: String(n), label: `${n} days` }))} value={r.post_days ? String(r.post_days) : ""}
              onChange={(v) => patch({ post_days: Number(v) })} />
            {postDaysNote(r.post_days ?? null, recentPerWeek) && <p className="gp-note" role="status">{postDaysNote(r.post_days ?? null, recentPerWeek)}</p>}
            <p className="gp-note">A posting day is a day with at least one post, so five posts on one day is still one day. This becomes your weekly target, and you can change it whenever you like.</p>
          </>
        )}

        {q === "filming" && (
          <>
            <Choices label="Filming days" multi columns={4} options={WEEKDAYS.map((d) => ({ id: d.id, label: d.label }))} value={days} onChange={(v) => setDays(v as Weekday[])} />
            {days.length > 0 && (
              <>
                {perDay
                  ? r.filming!.map((s) => timeRow(s.day, `Time on ${dayName(s.day)}`, s.minutes))
                  : timeRow("all", "How much time do you usually have?", shared)}
                {days.length > 1 && (
                  <button type="button" className="ob-linkbtn obr-toggle" onClick={() => { setPerDay((v) => !v); setCustomTime({}); if (perDay && r.filming?.length) setTime("all", r.filming[0].minutes); }}>
                    {perDay ? "Use the same time for every day" : "Set a different time for each day"}
                  </button>
                )}
              </>
            )}
          </>
        )}

        {q === "style" && (
          <Choices label="How you work" options={CREATION_STYLES} value={r.style ?? ""} onChange={(v) => patch({ style: v as CreationStyle })} />
        )}

        {q === "formats" && (
          <>
            <Choices label="Content you make" multi columns={3} options={CONTENT_FORMATS} value={r.formats ?? []} onChange={(v) => patch({ formats: v as ContentFormat[] })} />
            {r.formats?.includes("other") && (
              <div className="gp-row">
                <Field label="What else do you make?">
                  <Input maxLength={80} value={r.formats_other ?? ""} placeholder="e.g. Stop-motion" onChange={(e) => patch({ formats_other: e.target.value })} />
                </Field>
              </div>
            )}
          </>
        )}

        {q === "publish" && (
          <>
            <Choices label="Posting days" columns={3} options={PUBLISH_MODES} value={r.publish_mode ?? ""} onChange={(v) => patch({ publish_mode: v as PublishMode })} />
            {r.publish_mode === "days" && (
              <Choices label="Which days?" multi columns={4} options={WEEKDAYS.map((d) => ({ id: d.id, label: d.label }))} value={r.publish_days ?? []} onChange={(v) => patch({ publish_days: v as Weekday[] })} />
            )}
            {r.publish_mode === "recommend" && <p className="gp-note">SOCIA only recommends days once your own posts show a pattern. Until then it won&apos;t guess a best time.</p>}
          </>
        )}
      </div>

      {err && <div className="ob-err" role="alert">{err}</div>}
      <div className="ob-actions">
        <button className="ob-btn ob-btn-ghost" onClick={back} disabled={saving}>
          <ArrowLeft size={17} /> Back
        </button>
        <button className="ob-btn ob-btn-primary" onClick={() => void next()} disabled={saving}>
          {saving ? "Saving…" : i === ROUTINE_QUESTIONS.length - 1 ? "Build my strategy" : "Continue"} {!saving && <ArrowRight size={17} />}
        </button>
      </div>
    </>
  );
}

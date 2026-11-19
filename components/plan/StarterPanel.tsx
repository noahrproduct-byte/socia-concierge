"use client";

// Plan > Strategy, for an account still building its history
// (lib/starter/readiness.ts): SIO says what that means, how far the account
// is from SOCIA learning from its own results, what SOCIA already knows from
// onboarding, and only the questions nobody has answered yet. Saving an
// answer goes to the Growth Profile (or to Discover, for creators they
// admire), so it is never asked twice; then the strategy can be rewritten
// around it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/system";
import SioSays from "@/components/sio/SioSays";
import { MAIN_GOALS } from "@/lib/growth";
import { CONTENT_FORMATS, FILM_TIMES, POST_DAYS, WEEKDAYS, type ContentFormat, type Weekday } from "@/lib/routine";
import { STARTER_MESSAGE, type Readiness } from "@/lib/starter/readiness";
import type { StarterQuestion, StarterQuestionId } from "@/lib/starter/questions";

type Style = "on_camera" | "faceless" | "ai";
const STYLES: { id: Style; label: string }[] = [
  { id: "on_camera", label: "On camera" },
  { id: "faceless", label: "Faceless" },
  { id: "ai", label: "AI-generated" },
];

/** One answer as the Growth Profile patch it saves. */
function growthPatch(id: StarterQuestionId, v: string | string[] | number, minutes = 60): Record<string, unknown> | null {
  switch (id) {
    case "about": return { focus: String(v) };
    case "audience": return { audience: { who: String(v) } };
    case "goal": return { main_goal: String(v) };
    case "formats": return { routine: { formats: v as ContentFormat[] } };
    case "post_days": return { routine: { post_days: Number(v) } };
    case "filming": return { routine: { filming: (v as Weekday[]).map((day) => ({ day, minutes })) } };
    case "style":
      return v === "on_camera" ? { personality: { on_camera: "yes" } }
        : v === "faceless" ? { personality: { on_camera: "no" } }
        : { personality: { on_camera: "no" }, resources: { video_maker: "claude" } };
    default: return null;
  }
}

function Ask({ q, onSaved }: { q: StarterQuestion; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [many, setMany] = useState<string[]>([]);
  const [one, setOne] = useState<string>("");
  // Filming: how long they have on each of those days (their answer, never assumed).
  const [mins, setMins] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const value = q.id === "formats" || q.id === "filming" ? many : q.id === "goal" || q.id === "style" || q.id === "post_days" ? one : text.trim();
  const ready = (Array.isArray(value) ? value.length > 0 : Boolean(value)) && (q.id !== "filming" || mins != null);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      if (q.id === "admired") {
        const handles = text.split(/[\s,]+/).map((h) => h.trim().replace(/^@/, "")).filter(Boolean).slice(0, 5);
        for (const handle of handles) {
          const r = await fetch("/api/competitors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle, platform: "instagram" }) });
          if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`@${handle}: ${j.error ?? "couldn't be added"}`); }
        }
      } else {
        const growth = growthPatch(q.id, q.id === "post_days" ? Number(one) : value, mins ?? undefined);
        const r = await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brand_detail: { growth } }) });
        if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? "Couldn't save that."); }
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const chips = (opts: { id: string; label: string }[], multi: boolean) => (
    <div className="gss-chips" role={multi ? "group" : "radiogroup"} aria-label={q.question}>
      {opts.map((o) => {
        const on = multi ? many.includes(o.id) : one === o.id;
        return (
          <button key={o.id} type="button" role={multi ? undefined : "radio"} aria-checked={multi ? undefined : on} aria-pressed={multi ? on : undefined}
            className={`gss-chip${on ? " on" : ""}`} onClick={() => (multi ? setMany((m) => (m.includes(o.id) ? m.filter((x) => x !== o.id) : [...m, o.id])) : setOne(o.id))}>
            {o.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <li className="gss-q">
      <b>{q.question}</b>
      {q.id === "goal" ? chips(MAIN_GOALS.map((g) => ({ id: g.id, label: g.label })), false)
        : q.id === "style" ? chips(STYLES, false)
        : q.id === "post_days" ? chips(POST_DAYS.map((n) => ({ id: String(n), label: `${n} days` })), false)
        : q.id === "formats" ? chips(CONTENT_FORMATS.filter((f) => f.id !== "other").map((f) => ({ id: f.id, label: f.label })), true)
        : q.id === "filming" ? (
          <>
            {chips(WEEKDAYS.map((d) => ({ id: d.id, label: d.label })), true)}
            <div className="gss-chips" role="radiogroup" aria-label="Time on each of those days">
              {FILM_TIMES.map((f) => (
                <button key={f.minutes} type="button" role="radio" aria-checked={mins === f.minutes} className={`gss-chip${mins === f.minutes ? " on" : ""}`} onClick={() => setMins(f.minutes)}>{f.label}</button>
              ))}
            </div>
          </>
        )
        : <Input aria-label={q.question} value={text} onChange={(e) => setText(e.target.value)} maxLength={q.id === "admired" ? 160 : 300}
            placeholder={q.id === "admired" ? "Instagram handles, like @creator1, @creator2" : q.id === "about" ? "For example: quick weeknight recipes for students" : "For example: busy parents in Nashville"} />}
      <div className="gss-q-actions">
        <Button size="sm" busy={busy} disabled={!ready} onClick={() => void save()}>Save</Button>
        {err && <small className="s-error" role="alert">{err}</small>}
      </div>
    </li>
  );
}

export default function StarterPanel({ readiness, questions, canManage }: { readiness: Readiness; questions: StarterQuestion[]; canManage: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(0);
  const answered = questions.filter((q) => q.answer);
  const open = questions.filter((q) => !q.answer);
  const own = Math.round(readiness.ownWeight * 100);
  const t = readiness.thresholds;
  const goal = readiness.stage === "starting" ? t.startUnder : t.fullAt;
  const pct = Math.min(100, Math.round((readiness.measured / goal) * 100));

  return (
    <section className="gss" aria-labelledby="gss-h">
      <SioSays expression="happy" title={readiness.stage === "starting" ? "Let's build your starter strategy" : "Your account is starting to show what works"}>
        {readiness.stage === "starting" ? STARTER_MESSAGE : `Your own results now count for ${own}% of your strategy, and more with every post you publish. The experiments keep running until there is enough to lead with them.`}
      </SioSays>

      <div className="gss-progress">
        <h3 id="gss-h">{readiness.stage === "starting" ? "Before SOCIA can learn from your own posts" : "Until your own results lead"}</h3>
        <div className="gss-bar" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={readiness.measured} aria-label="Measured posts">
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="gss-count"><b>{readiness.measured}</b> of {goal} measured posts</p>
        <ul className="gss-reasons">{readiness.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="gss-weight">This strategy rests on your goals and your niche for {100 - own}%, and on your own results for {own}%.</p>
      </div>

      {answered.length > 0 && (
        <div className="gss-known">
          <h3>What SOCIA already knows from you</h3>
          <dl>{answered.map((q) => <div key={q.id}><dt>{q.question}</dt><dd>{q.answer}</dd></div>)}</dl>
        </div>
      )}

      {canManage && open.length > 0 && (
        <div className="gss-open">
          <h3>{open.length === 1 ? "One question left" : `${open.length} questions left`}</h3>
          <ul>{open.map((q) => <Ask key={q.id} q={q} onSaved={() => { setSaved((n) => n + 1); router.refresh(); }} />)}</ul>
        </div>
      )}
      {saved > 0 && <p className="gss-saved" role="status">Saved. Rewrite the strategy below to build it around your answers.</p>}
    </section>
  );
}

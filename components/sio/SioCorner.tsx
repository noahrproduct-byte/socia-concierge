"use client";

// SIO in the corner of the app. It is the face of the Ask SOCIA bubble (one
// assistant, not two), and on the Dashboard it asks the routine questions
// that are still unanswered: for someone who came through onboarding, the
// three it left for later (filming days, how they work, posting days); for a
// brand set up before SIO, all five (lib/routine.ts). It speaks first with one line and
// two buttons; the questions open only when the person asks for them. "Not
// now" hides it for this visit, "Don't ask again" for good on this device.
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { FIRST_QUESTIONS, LATER_QUESTIONS, unanswered, type Routine, type RoutineQuestion } from "@/lib/routine";
import { FEELS, checkinDue, checkinSuggestion, type Feel, type Suggestion } from "@/lib/checkin";
import RoutineStep from "@/components/onboarding/RoutineStep";
import Sio from "./Sio";
import SioSays from "./SioSays";

const LATER = (ws: string) => `sio-routine-later:${ws}`;
const OFF = (ws: string) => `sio-routine-off:${ws}`;
/** The week SIO last checked in about, and whether check-ins are off, on this device. */
const CHECKED = (ws: string) => `sio-checkin:${ws}`;
const CHECKIN_OFF = (ws: string) => `sio-checkin-off:${ws}`;
const read = (key: string): string | null => { try { return window.localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* storage unavailable */ } };
/** Today as the person's own calendar day. */
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const get = (store: "session" | "local", key: string): boolean => {
  try { return (store === "session" ? window.sessionStorage : window.localStorage).getItem(key) === "1"; } catch { return false; }
};
const set = (store: "session" | "local", key: string) => {
  try { (store === "session" ? window.sessionStorage : window.localStorage).setItem(key, "1"); } catch { /* storage unavailable: it simply asks again next time */ }
};

export default function SioCorner({ workspaceId, onDashboard, onAsk }: {
  workspaceId: string | null;
  /** The person is on the Dashboard: the only page where SIO speaks first. */
  onDashboard: boolean;
  /** Open Ask SOCIA. */
  onAsk: () => void;
}) {
  const ws = workspaceId ?? "default";
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [left, setLeft] = useState<RoutineQuestion[]>([]);
  const [stage, setStage] = useState<"hidden" | "offer" | "asking" | "thanks" | "checkin" | "reply" | "changed">("hidden");
  // The weekly check-in: which week it is about, whether that week met the target, and SIO's answer.
  const [checkin, setCheckin] = useState<{ week: string; phrase: string; met: boolean | null } | null>(null);
  const [reply, setReply] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const headRef = useRef<HTMLHeadingElement>(null);

  // What is still unanswered, read from the brand's saved profile. Only the Dashboard asks.
  useEffect(() => {
    if (!onDashboard || get("local", OFF(ws)) || get("session", LATER(ws))) { setStage("hidden"); return; }
    let alive = true;
    fetch("/api/profile").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!alive) return;
      if (!j?.profile) return;
      const growth = j.profile.brand_detail?.growth as { routine?: Routine } | undefined;
      // A brand set up before SIO asked anything has all five to answer; one that came through onboarding has the three left for later.
      const todo = unanswered(growth?.routine, [...FIRST_QUESTIONS, ...LATER_QUESTIONS]);
      setRoutine(growth?.routine ?? null);
      setLeft(todo);
      if (todo.length) { setStage("offer"); return; }
      // Everything answered: once a week, near its end, SIO asks how the routine felt.
      const due = checkinDue(localToday());
      if (!due || !growth?.routine?.post_days || read(CHECKIN_OFF(ws)) === "1" || read(CHECKED(ws)) === due.week) return;
      fetch("/api/perks").then((r) => (r.ok ? r.json() : null)).then((p) => {
        if (!alive) return;
        const posting = p?.posting as { thisWeek?: { qualified?: boolean }; strip?: { week_start: string; state: string }[] } | null | undefined;
        const met = !posting ? null : due.phrase === "this week" ? Boolean(posting.thisWeek?.qualified) : (posting.strip?.find((x) => x.week_start === due.week)?.state === "hit");
        setCheckin({ ...due, met });
        setStage("checkin");
      }).catch(() => undefined);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [onDashboard, ws]);

  const later = () => { set("session", LATER(ws)); setStage("hidden"); };
  const never = () => { set("local", OFF(ws)); setStage("hidden"); };
  // The check-in is asked once for a week: answering it or closing it both count.
  const closeCheckin = () => { if (checkin) write(CHECKED(ws), checkin.week); setStage("hidden"); };
  const answer = (feel: Feel) => {
    if (!checkin) return;
    write(CHECKED(ws), checkin.week);
    setReply(checkinSuggestion(feel, routine?.post_days, checkin.met));
    setStage("reply");
  };
  /** The person accepted SIO's offer: save the new target. It starts the following Monday (the server works that out). */
  async function accept(days: number) {
    setBusy(true);
    const next: Routine = { ...(routine ?? {}), post_days: days };
    const res = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_detail: { growth: { routine: next } } }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setReply({ say: "I couldn't save that just now. You can change your target in Settings, under Growth Profile.", offer: null }); return; }
    setRoutine(next);
    setStage("changed");
  }
  // SIO's answer as a line and the rest of it.
  const [replyHead, ...replyRest] = (reply?.say ?? "").split(/(?<=[.?])\s+/);

  return (
    <>
      {stage !== "hidden" && (
        <section className={`sio-corner is-${stage}`} aria-label="SIO">
          {stage !== "asking" && (
            <button type="button" className="sio-corner-x" onClick={stage === "checkin" || stage === "reply" || stage === "changed" ? closeCheckin : later} aria-label="Close"><X size={15} /></button>
          )}
          {stage === "checkin" && checkin && (
            <>
              <SioSays compact title={`How did your content routine feel ${checkin.phrase}?`}>Your answer helps me keep your week realistic.</SioSays>
              <div className="sio-corner-actions">
                {FEELS.map((f) => <button key={f.id} type="button" className="ob-btn ob-btn-ghost" onClick={() => answer(f.id)}>{f.label}</button>)}
              </div>
              <button type="button" className="ob-linkbtn sio-corner-never" onClick={() => { write(CHECKIN_OFF(ws), "1"); setStage("hidden"); }}>Don&apos;t ask again</button>
            </>
          )}
          {stage === "reply" && reply && (
            <>
              <SioSays compact title={replyHead}>{replyRest.join(" ")}</SioSays>
              <div className="sio-corner-actions">
                {reply.offer != null ? (
                  <>
                    <button type="button" className="ob-btn ob-btn-primary" disabled={busy} onClick={() => void accept(reply.offer!)}>{busy ? "Saving…" : `Yes, make it ${reply.offer}`}</button>
                    <button type="button" className="ob-btn ob-btn-ghost" disabled={busy} onClick={closeCheckin}>Keep {routine?.post_days}</button>
                  </>
                ) : (
                  <button type="button" className="ob-btn ob-btn-ghost" onClick={closeCheckin}>Close</button>
                )}
              </div>
            </>
          )}
          {stage === "changed" && (
            <SioSays compact expression="happy" speakAs="happy" title={`Done. ${routine?.post_days} posting ${routine?.post_days === 1 ? "day" : "days"} a week, from next Monday.`}>
              This week keeps the target it began with. You can change it again any time in Settings.
            </SioSays>
          )}
          {stage === "offer" && (
            <>
              <SioSays compact title={left.length === 1 ? "I have one quick question about your week." : `I have ${left.length} quick questions about your week.`}>
                Your answers decide how I lay out your plan: when you film and when you post.
              </SioSays>
              <div className="sio-corner-actions">
                <button type="button" className="ob-btn ob-btn-primary" onClick={() => setStage("asking")}>Answer now</button>
                <button type="button" className="ob-btn ob-btn-ghost" onClick={later}>Not now</button>
              </div>
              <button type="button" className="ob-linkbtn sio-corner-never" onClick={never}>Don&apos;t ask again</button>
            </>
          )}
          {stage === "asking" && (
            <RoutineStep corner initial={routine} recentPerWeek={null} headRef={headRef} questions={left} lastLabel="Done"
              onSaved={setRoutine} onBack={later} onDone={() => setStage("thanks")} />
          )}
          {stage === "thanks" && (
            <SioSays compact expression="happy" speakAs="happy" title="Thanks. That's everything I needed.">
              Your next plan is laid out around these answers. You can change them any time in Settings, under Growth Profile.
            </SioSays>
          )}
        </section>
      )}
      <button type="button" className="ask-bubble sio-bubble" onClick={onAsk} aria-label="Ask SOCIA">
        <Sio size={40} shadow={false} expression={stage === "thanks" ? "happy" : "neutral"} />
      </button>
    </>
  );
}

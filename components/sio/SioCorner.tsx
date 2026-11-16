"use client";

// SIO in the corner of the app. It is the face of the Ask SOCIA bubble (one
// assistant, not two), and on the Dashboard it asks the routine questions
// that onboarding left for later: filming days, how the person works, posting
// days (lib/routine.ts LATER_QUESTIONS). It speaks first with one line and
// two buttons; the questions open only when the person asks for them. "Not
// now" hides it for this visit, "Don't ask again" for good on this device.
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { LATER_QUESTIONS, unanswered, type Routine, type RoutineQuestion } from "@/lib/routine";
import RoutineStep from "@/components/onboarding/RoutineStep";
import Sio from "./Sio";
import SioSays from "./SioSays";

const LATER = (ws: string) => `sio-routine-later:${ws}`;
const OFF = (ws: string) => `sio-routine-off:${ws}`;
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
  const [stage, setStage] = useState<"hidden" | "offer" | "asking" | "thanks">("hidden");
  const headRef = useRef<HTMLHeadingElement>(null);

  // What is still unanswered, read from the brand's saved profile. Only the Dashboard asks.
  useEffect(() => {
    if (!onDashboard || get("local", OFF(ws)) || get("session", LATER(ws))) { setStage("hidden"); return; }
    let alive = true;
    fetch("/api/profile").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!alive) return;
      const growth = j?.profile?.brand_detail?.growth as { routine?: Routine } | undefined;
      // Someone who hasn't met SIO's first questions yet (set up before the routine existed) isn't asked the later ones out of nowhere.
      if (!growth?.routine?.post_days) return;
      const todo = unanswered(growth.routine, LATER_QUESTIONS);
      setRoutine(growth.routine);
      setLeft(todo);
      if (todo.length) setStage("offer");
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [onDashboard, ws]);

  const later = () => { set("session", LATER(ws)); setStage("hidden"); };
  const never = () => { set("local", OFF(ws)); setStage("hidden"); };

  return (
    <>
      {stage !== "hidden" && (
        <section className={`sio-corner is-${stage}`} aria-label="SIO">
          {stage !== "asking" && (
            <button type="button" className="sio-corner-x" onClick={later} aria-label="Close"><X size={15} /></button>
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
              Your next plan is laid out around these answers. You can change them any time in Settings.
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

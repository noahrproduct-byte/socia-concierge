"use client";

// Plays a few lines as SIO speaking them: how many words of each line are out,
// the mouth's shape right now, the mood of the sentence being said, and when
// it has finished. One clock drives both the text and the face
// (lib/sioSpeech.ts), so they stay together.
// With reduced motion, or `still`, the lines are simply there.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { speechAt, speechPlan, type SpeechMoment } from "@/lib/sioSpeech";

export type SioSpeech = SpeechMoment & { skip: () => void };

export function useSioSpeech(lines: (string | null | undefined)[], still = false): SioSpeech {
  // The lines as one string: the speech restarts only when the words change.
  const key = lines.map((l) => l ?? "").join("\u0001");
  const plan = useMemo(() => speechPlan(key.split("\u0001")), [key]);
  const done = useMemo(() => speechAt(plan, plan.total + 1), [plan]);
  const [state, setState] = useState(() => speechAt(plan, -1));
  const raf = useRef(0);
  const skipped = useRef(false);

  useEffect(() => {
    skipped.current = false;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still || reduce || !plan.words.length) { setState(done); return; }
    setState(speechAt(plan, -1));
    const t0 = performance.now();
    let last = "";
    const tick = () => {
      if (skipped.current) return;
      const s = speechAt(plan, performance.now() - t0);
      // Only a change in what is seen causes a render, not every frame.
      const sig = `${s.shown.join(",")}|${s.mouth}|${s.speaking}|${s.mood}|${s.glance}`;
      if (sig !== last) { last = sig; setState(s); }
      if (s.speaking) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [plan, done, still]);

  const skip = useCallback(() => {
    skipped.current = true;
    cancelAnimationFrame(raf.current);
    setState(done);
  }, [done]);

  return { ...state, skip };
}

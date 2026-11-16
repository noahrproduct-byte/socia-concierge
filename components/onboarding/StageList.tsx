"use client";

// The steps of a piece of real work, as the server reports them: waiting,
// running, done (with what was found) or done with nothing to read. Used by
// the account read and the strategy build in onboarding. Nothing here moves
// on a timer; a step changes only when its event arrives.
import { Check, Loader2, Minus } from "lucide-react";

export type StageItem = { thumb: string | null; href: string | null; label: string; note: string };
export type StageState = { state: "wait" | "run" | "done"; ok: boolean; lines: string[]; items: StageItem[] };
export const waiting = (): StageState => ({ state: "wait", ok: true, lines: [], items: [] });

/** A stage after one of its events: "start" keeps what a later "done" will replace. */
export function afterEvent(cur: StageState, e: { state: "start" | "done"; ok?: boolean; lines?: string[]; items?: StageItem[] }): StageState {
  return e.state === "start"
    ? { ...cur, state: "run", lines: e.lines ?? cur.lines, items: e.items ?? cur.items }
    : { state: "done", ok: e.ok ?? true, lines: e.lines ?? [], items: e.items ?? [] };
}

export default function StageList<Id extends string>({ stages, states, busy }: { stages: readonly { id: Id; label: string }[]; states: Record<Id, StageState>; busy: boolean }) {
  return (
    <ol className="obs-stages" aria-live="polite" aria-busy={busy}>
      {stages.map((s) => {
        const st = states[s.id];
        return (
          <li key={s.id} className={`is-${st.state}${st.state === "done" && !st.ok ? " is-none" : ""}`}>
            <span className="obs-mark" aria-hidden>
              {st.state === "run" ? <Loader2 size={14} className="spin" /> : st.state === "done" ? (st.ok ? <Check size={14} /> : <Minus size={14} />) : null}
            </span>
            <div className="obs-body">
              <b>{s.label}{st.state === "done" && <span className="sr-only">{st.ok ? " (done)" : " (nothing to read)"}</span>}</b>
              {st.lines.map((l, i) => <p key={i}>{l}</p>)}
              {st.items.length > 0 && (
                <ul className="obs-items">
                  {st.items.map((it, i) => (
                    <li key={i}>
                      {/* The person's own post, from the platform: a plain img, since the address is the platform's. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {it.thumb ? <img src={it.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.hidden = true; }} /> : <span className="obs-nothumb" aria-hidden />}
                      <span><b>{it.label}</b><small>{it.note}</small></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Read a response of one JSON object per line, handing each to `take` as it arrives. */
export async function readLines<E>(res: Response, take: (e: E) => void): Promise<void> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const one = (line: string) => { if (line.trim()) take(JSON.parse(line) as E); };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) one(l);
  }
  if (buf) one(buf);
}

"use client";
// The launch offer on the pricing page and the homepage (lib/launch.ts): the
// full price crossed out above the launch price, and a live countdown to the
// real end of the launch. Both read the clock in the browser, so a page that
// was rendered earlier still drops them the moment the launch ends.
import { useEffect, useState } from "react";
import { LAUNCH_END_LONG, LAUNCH_END_TEXT, LAUNCH_ENDS_AT, launchFullPrice, launchOn, timeLeft, usdText } from "@/lib/launch";
import type { PlanId } from "@/lib/plans";
import "./launch.css";

/** The clock, ticking once a second while the launch runs. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= LAUNCH_ENDS_AT) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** The clock for the crossed-out prices: no ticking, one re-render when the launch ends. */
function useEndClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const check = () => {
      const n = Date.now();
      setNow(n);
      // setTimeout can't wait longer than about 24 days, so long waits check again.
      if (n < LAUNCH_ENDS_AT) t = setTimeout(check, Math.min(LAUNCH_ENDS_AT - n + 50, 2 ** 31 - 1));
    };
    check();
    return () => clearTimeout(t);
  }, []);
  return now;
}

/** "$29.99" crossed out, for the line above a plan's launch price. Nothing for Free or after the launch. */
export function LaunchWas({ plan, price, className }: { plan: PlanId; price: number; className?: string }) {
  const now = useEndClock();
  const full = launchFullPrice(plan, price, now);
  // Free keeps an empty row of the same height, so every card's price sits on one line.
  if (full == null) return launchOn(now) ? <span className={["ln-was", className].filter(Boolean).join(" ")} aria-hidden /> : null;
  return (
    <span className={["ln-was", className].filter(Boolean).join(" ")}>
      <s>
        <span className="ln-sr">Full price </span>
        {usdText(full)}
      </s>
      <span className="ln-was-tag">Launch price</span>
    </span>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A digit rolls in only if it appeared after the page went live, so a digit that didn't change never moves. */
function Digit({ d, live }: { d: string; live: boolean }) {
  const [roll] = useState(live);
  return <span className={roll ? "ln-digit is-live" : "ln-digit"} suppressHydrationWarning>{d}</span>;
}

/** One unit of the countdown. Each digit rolls in when it changes. */
function Unit({ value, label, live }: { value: number; label: string; live: boolean }) {
  return (
    <span className="ln-unit">
      <span className="ln-digits" aria-hidden>
        {pad(value).split("").map((d, i) => (
          <Digit key={`${i}-${d}`} d={d} live={live} />
        ))}
      </span>
      <span className="ln-label" aria-hidden>{label}</span>
    </span>
  );
}

/** The band that counts down to the end of the launch. */
export function LaunchCountdown({ className }: { className?: string }) {
  const now = useNow();
  // Digits only roll once the page is running in the browser, never on the first paint.
  const [live, setLive] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLive(true), 1100);
    return () => clearTimeout(t);
  }, []);
  if (now >= LAUNCH_ENDS_AT) return null;
  const left = timeLeft(now);
  return (
    <section className={["ln-band", className].filter(Boolean).join(" ")} aria-labelledby="ln-title">
      <div className="ln-copy">
        <h2 id="ln-title" className="ln-title">Launch prices end {LAUNCH_END_TEXT}</h2>
        <p className="ln-sub">Join before then and keep your launch price for as long as you stay subscribed. From January 1, new members pay the full price.</p>
      </div>
      <div className="ln-clock" role="timer" aria-label={`Launch prices end ${LAUNCH_END_LONG}`}>
        <Unit value={left.days} label="days" live={live} />
        <span className="ln-sep" aria-hidden>:</span>
        <Unit value={left.hours} label="hours" live={live} />
        <span className="ln-sep" aria-hidden>:</span>
        <Unit value={left.minutes} label="minutes" live={live} />
        <span className="ln-sep" aria-hidden>:</span>
        <Unit value={left.seconds} label="seconds" live={live} />
      </div>
    </section>
  );
}

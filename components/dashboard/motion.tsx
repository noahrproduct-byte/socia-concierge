"use client";

// The Overview's motion, in one place (Noah's brief, 2026-11-03): sections
// rise in once with a short stagger, figures count up once, rings and bars
// fill once, expanders open smoothly. Nothing loops and nothing moves after it
// settles. With prefers-reduced-motion every piece jumps to its final state
// the moment the page hydrates (the transition's duration is zero), and
// figures never count. The `initial` props are the same on the server and in
// the browser so hydration never disagrees; the figures themselves are always
// written out in full in the markup, so a crawler, a screen reader or a page
// without JavaScript never reads a zero.

import { AnimatePresence, motion, useReducedMotion, type Transition } from "framer-motion";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export const STAGGER = 0.06;
export const RISE: Transition = { duration: 0.35, ease: [0.23, 1, 0.32, 1] };

/** True once the page runs in a browser that allows motion (false on the server and under reduced motion). */
export function useMotionOk(): boolean {
  const reduced = useReducedMotion();
  return reduced === false;
}

/** A transition, or an instant jump when motion is reduced. */
const when = (ok: boolean, t: Transition): Transition => (ok ? t : { duration: 0, delay: 0 });

/**
 * A section that fades and rises in once. `index` sets its place in the
 * stagger. It is a wrapper: framer leaves an inline transform on it once it
 * settles, so a card that lifts on hover goes inside, never on it.
 */
export function Reveal({ index = 0, className, children, as = "div" }: { index?: number; className?: string; children: ReactNode; as?: "div" | "section" | "li" }) {
  const ok = useMotionOk();
  const Tag = motion[as];
  return (
    <Tag className={className} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={when(ok, { ...RISE, delay: index * STAGGER })}>
      {children}
    </Tag>
  );
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A figure that counts up once after mount. The markup carries the final
 * value (and announces it); only the visible digits move.
 */
export function CountUp({ value, format = (n) => String(Math.round(n)), duration = 700, className }: { value: number; format?: (n: number) => string; duration?: number; className?: string }) {
  const ok = useMotionOk();
  const [shown, setShown] = useState(value);
  const done = useRef(false);
  useIsoLayoutEffect(() => {
    if (!ok || done.current) return;
    done.current = true;
    setShown(0);
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(value * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ok, value, duration]);
  // Once the first count is done, a changed value shows at once (a range switch is a new fact, not a reveal).
  useEffect(() => { if (done.current) setShown(value); }, [value]);
  return (
    <span className={className} aria-label={format(value)}>
      <span aria-hidden>{format(shown)}</span>
    </span>
  );
}

/**
 * A progress ring that fills once from empty. `share` is 0..1; the tone
 * colours the arc and the caller pairs it with a word.
 */
export function Ring({ share, size = 104, stroke = 8, tone, label, children }: { share: number; size?: number; stroke?: number; tone: "low" | "ok" | "good" | "none"; label: string; children?: ReactNode }) {
  const ok = useMotionOk();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(1, Math.max(0, share)));
  return (
    <span className={`dash-ring is-${tone}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="dash-ring-track" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="dash-ring-fill"
          strokeWidth={stroke}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: off }}
          transition={when(ok, { duration: 0.9, ease: [0.23, 1, 0.32, 1], delay: 0.1 })}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="dash-ring-body" aria-hidden>{children}</span>
    </span>
  );
}

/** A horizontal bar that grows once from the left. `share` is 0..1. */
export function Bar({ share, tone = "data", className }: { share: number; tone?: "data" | "you" | "muted"; className?: string }) {
  const ok = useMotionOk();
  return (
    <span className={`dash-bar is-${tone}${className ? ` ${className}` : ""}`} aria-hidden>
      <motion.i initial={{ scaleX: 0 }} animate={{ scaleX: Math.min(1, Math.max(0, share)) }} transition={when(ok, { duration: 0.6, ease: [0.23, 1, 0.32, 1], delay: 0.15 })} />
    </span>
  );
}

/**
 * The expander every card uses for its longer reading: a quiet "Details" or
 * "Why?" button, and a panel that opens to its own height.
 */
export function Details({ label = "Details", openLabel, children, className, defaultOpen = false, size = "sm" }: { label?: string; openLabel?: string; children: ReactNode; className?: string; defaultOpen?: boolean; size?: "sm" | "md" }) {
  const ok = useMotionOk();
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={`dash-details${className ? ` ${className}` : ""}`}>
      <button type="button" className={`dash-details-btn is-${size}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span>{open ? openLabel ?? label : label}</span>
        <ChevronDown aria-hidden className={open ? "is-open" : undefined} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            key="panel"
            className="dash-details-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={when(ok, { duration: 0.25, ease: [0.23, 1, 0.32, 1] })}
            style={{ overflow: "hidden" }}
          >
            <div className="dash-details-inner">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

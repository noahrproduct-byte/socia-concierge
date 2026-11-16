"use client";

// SIO, SOCIA's assistant character (Noah's design, 2026-11-16). The body is
// his reference render with the background cut away and the face blanked
// (public/sio/sio-body.webp); the face is drawn here, live, on the glass, so
// every expression is a real state of one character and not a different
// picture. Idle motion is small on purpose: a slow float, a blink, and one
// short reaction when the expression changes. With reduced motion, or
// `still`, SIO holds each expression without moving.
//
// Sizes: any width. Below SMALL the mouth and cheeks are left out and the eyes
// are drawn larger, so the face still reads as SIO at avatar size.
import { useEffect, useId, useState } from "react";
import Image from "next/image";
import "./sio.css";

export const SIO_EXPRESSIONS = ["neutral", "happy", "thinking", "listening", "analyzing", "celebrating", "concerned"] as const;
export type SioExpression = (typeof SIO_EXPRESSIONS)[number];

/** The body layer's own pixel box; the face is drawn in the same coordinates. */
const W = 950;
const H = 769;
/** Below this width SIO is an avatar: fewer details, drawn larger. */
const SMALL = 56;
/** How long the eyes take to close before a new expression opens (ms). */
const SWAP_MS = 90;

// Where the eyes and mouth sit on the glass, measured from the reference. The
// head is turned a little, so the far eye is smaller and tilted.
const LEFT = { x: 234, y: 470, scale: 1, tilt: 2 };
const RIGHT = { x: 512, y: 440, scale: 1.18, tilt: -6 };
const MOUTH = { x: 385, y: 558 };
/** The glass, pulled in from its rim: what the scan line is clipped to. */
const GLASS = "M674,473 L663,513 L644,549 L617,579 L585,600 L553,616 L522,627 L493,635 L465,641 L437,645 L410,649 L382,651 L352,652 L319,652 L283,648 L243,640 L205,623 L170,596 L142,560 L151,514 L154,473 L171,435 L180,399 L193,363 L201,322 L276,339 L314,341 L342,340 L372,355 L392,357 L410,355 L430,349 L468,296 L504,290 L548,284 L593,291 L637,309 L656,348 L671,389 L677,431Z";

/** One eye for an expression, drawn around (0,0); `side` is -1 for the left eye, 1 for the right. */
function Eye({ expr, side }: { expr: SioExpression; side: -1 | 1 }) {
  switch (expr) {
    case "happy":
      return <path d="M-66,20 C-44,-46 44,-46 66,20 C44,-1 -44,-1 -66,20Z" strokeWidth={10} />;
    case "celebrating":
      return <path d="M-72,24 C-48,-54 48,-54 72,24 C48,-2 -48,-2 -72,24Z" strokeWidth={10} />;
    case "thinking":
      // Looking up and to one side, the far eye a touch narrower.
      return <rect x={-27 - 13} y={-38 - 15} width={54} height={side === 1 ? 70 : 76} rx={27} />;
    case "listening":
      return <rect x={-31} y={-48} width={62} height={96} rx={31} />;
    case "analyzing":
      return <rect x={-58} y={-9} width={116} height={18} rx={9} />;
    case "concerned":
      // Soft and a little lowered, the inner corners raised. Worried, never cross.
      return <rect x={-27} y={-32} width={54} height={68} rx={27} transform={`rotate(${side * -12})`} />;
    default:
      return <rect x={-29} y={-43} width={58} height={86} rx={29} />;
  }
}

function Mouth({ expr }: { expr: SioExpression }) {
  const line = { fill: "none", strokeWidth: 13, strokeLinecap: "round" as const };
  switch (expr) {
    case "happy":
      return <path d="M-38,-8 Q0,22 38,-8" {...line} />;
    case "celebrating":
      return <path d="M-40,-10 Q0,44 40,-10Z" strokeWidth={8} strokeLinejoin="round" />;
    case "thinking":
      return <path d="M-20,2 L14,0" {...line} />;
    case "listening":
      return <ellipse rx={12} ry={10} />;
    case "analyzing":
      return <path d="M-22,0 L22,0" {...line} />;
    case "concerned":
      return <path d="M-26,6 Q0,-7 26,6" {...line} />;
    default:
      return <path d="M-28,-4 Q0,10 28,-4" {...line} />;
  }
}

/** The dotted cheeks from the reference, shown only when SIO is pleased. */
function Cheeks() {
  const dots = (cx: number, cy: number, tilt: number) => (
    <g transform={`translate(${cx} ${cy}) rotate(${tilt})`}>
      {[0, 1, 2].flatMap((r) => [0, 1, 2, 3, 4, 5].map((c) => <circle key={`${r}-${c}`} cx={(c - 2.5) * 13} cy={(r - 1) * 12} r={2.6} />))}
    </g>
  );
  return (
    <g className="sio-cheeks">
      {dots(196, 546, 6)}
      {dots(566, 506, -8)}
    </g>
  );
}

export default function Sio({
  expression = "neutral",
  size = 160,
  still = false,
  shadow = true,
  label,
  priority = false,
  className,
}: {
  expression?: SioExpression;
  /** Width in pixels; the height follows the character's own shape. */
  size?: number;
  /** Hold still: no float, blink or reaction (also what reduced motion gives). */
  still?: boolean;
  /** The soft shadow SIO floats over. Off for an avatar in a tight row. */
  shadow?: boolean;
  /** Said to screen readers. Without it SIO is decoration and is skipped. */
  label?: string;
  /** Load the body layer early (the first screen of onboarding). */
  priority?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  // The face shown lags the one asked for by a blink, so an expression never snaps.
  const [shown, setShown] = useState<SioExpression>(expression);
  const [swapping, setSwapping] = useState(false);
  useEffect(() => {
    if (expression === shown) return;
    setSwapping(true);
    const t = setTimeout(() => { setShown(expression); setSwapping(false); }, SWAP_MS);
    return () => clearTimeout(t);
  }, [expression, shown]);

  const small = size < SMALL;
  const eyeScale = small ? 1.3 : 1;
  const height = Math.round((size * H) / W);
  // The width is a CSS variable, so a layout can make SIO smaller on a phone without a second render.
  const box = { "--sio-size": `${size}px` } as React.CSSProperties;
  return (
    <span
      className={["sio", small ? "is-small" : "", still ? "is-still" : "", swapping ? "is-swap" : "", className].filter(Boolean).join(" ")}
      data-expr={shown}
      style={box}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <span className="sio-float">
        <span className="sio-pose">
          <Image src="/sio/sio-body.webp" alt="" width={size} height={height} sizes={`${size}px`} priority={priority} draggable={false} className="sio-shell" />
          <svg className="sio-face" viewBox={`0 0 ${W} ${H}`} focusable="false">
            <defs>
              <clipPath id={`${id}-glass`}><path d={GLASS} /></clipPath>
              <filter id={`${id}-glow`} x="-40%" y="-60%" width="180%" height="220%">
                <feGaussianBlur stdDeviation="9" />
              </filter>
            </defs>
            {shown === "analyzing" && (
              <g clipPath={`url(#${id}-glass)`}>
                <rect className="sio-scan" x={120} y={270} width={580} height={26} rx={13} />
              </g>
            )}
            {/* The same shapes twice: a soft blue halo under a pale core, as light on dark glass looks. */}
            {(["sio-halo", "sio-core"] as const).map((layer) => (
              <g key={layer} className={layer} filter={layer === "sio-halo" ? `url(#${id}-glow)` : undefined}>
                {([[LEFT, -1], [RIGHT, 1]] as const).map(([e, side]) => (
                  <g key={side} transform={`translate(${e.x} ${e.y}) rotate(${e.tilt}) scale(${e.scale * eyeScale})`}>
                    <g className="sio-eye"><Eye expr={shown} side={side} /></g>
                  </g>
                ))}
                {!small && (
                  <g transform={`translate(${MOUTH.x} ${MOUTH.y}) rotate(-3)`} className="sio-mouth"><Mouth expr={shown} /></g>
                )}
              </g>
            ))}
            {!small && (shown === "happy" || shown === "celebrating") && <Cheeks />}
          </svg>
        </span>
      </span>
      {shadow && !small && (
        <svg className="sio-shadow" viewBox="0 0 200 40" focusable="false">
          <defs><filter id={`${id}-soft`} x="-20%" y="-150%" width="140%" height="400%"><feGaussianBlur stdDeviation="6" /></filter></defs>
          <ellipse cx={100} cy={20} rx={58} ry={7} filter={`url(#${id}-soft)`} />
        </svg>
      )}
    </span>
  );
}

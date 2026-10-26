"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap, reduced } from "./motion";

// The reference's hover: a screen leans a few degrees toward the pointer and
// settles back when it leaves. Pointer only (no effect on touch), off under
// reduced motion, and never more than four degrees, so it reads as depth
// rather than as a trick.

const MAX = 4;

export default function Tilt({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const card = el.firstElementChild as HTMLElement | null;
    if (!card) return;
    const lean = (rotateX: number, rotateY: number) => gsap.to(card, { rotateX, rotateY, duration: 0.6, ease: "power3.out", overwrite: "auto" });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      lean(-py * MAX * 2, px * MAX * 2);
    };
    const leave = () => lean(0, 0);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); gsap.set(card, { clearProps: "transform" }); };
  }, []);

  return <div ref={ref} className="lp-tilt">{children}</div>;
}

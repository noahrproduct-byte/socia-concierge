"use client";

import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// The homepage's motion, in one place. Two kinds only, both from the bar
// (docs/design/bar.md, mechanism 4): one orchestrated load sequence in the
// hero, and reveals that happen once as a section enters, rise 24px or less,
// finish within half a second and never loop. Three reveals show something
// happening rather than decorate: the Today rows arrive one by one, the loop's
// line draws from step to step, and the analytics bars grow to their value.
// Reduced motion turns all of it off: everything is already in its final
// state in the markup and the stylesheet, so nothing is lost.

gsap.registerPlugin(ScrollTrigger);

const EASE = "power3.out";

export default function HomeMotion() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.querySelector<HTMLElement>(".hm");
    if (!root) return;
    root.dataset.motion = "on";

    const ctx = gsap.context(() => {
      // 1. the load sequence: nav, then the headline, then the rest, then the art
      const hero = root.querySelector(".hm-hero");
      if (hero) {
        const parts = [".hm-nav-in", ".hm-hero .hm-h1", ".hm-hero .hm-lead", ".hm-hero .hm-hero-cta", ".hm-hero .hm-meta"]
          .map((s) => root.querySelector(s))
          .filter(Boolean) as Element[];
        gsap.set(parts, { opacity: 0, y: 16 });
        gsap.set(".hm-hero-art", { opacity: 0 });
        gsap
          .timeline({ defaults: { ease: EASE } })
          .to(".hm-hero-art", { opacity: 1, duration: 1.2, ease: "power2.out" }, 0)
          .to(parts, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08 }, 0.15);
      }

      // 2. reveals: anything marked data-reveal, once, as it enters
      root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
        const children = el.dataset.reveal === "children" ? Array.from(el.children) : [el];
        gsap.set(children, { opacity: 0, y: 20 });
        ScrollTrigger.create({
          trigger: el,
          start: "top 82%",
          once: true,
          onEnter: () => gsap.to(children, { opacity: 1, y: 0, duration: 0.5, ease: EASE, stagger: children.length > 1 ? 0.06 : 0 }),
        });
      });

      // 3. the Today rows arrive one by one, the selection lands last
      const win = root.querySelector(".hm-window");
      if (win) {
        const rows = win.querySelectorAll(".hm-row-item");
        gsap.set(rows, { opacity: 0, x: -8 });
        ScrollTrigger.create({
          trigger: win,
          start: "top 75%",
          once: true,
          onEnter: () => gsap.to(rows, { opacity: 1, x: 0, duration: 0.4, ease: EASE, stagger: 0.12 }),
        });
      }

      // 4. the loop's line draws from 01 to 04 and back
      const line = root.querySelector<SVGPathElement>(".hm-loop-line path");
      if (line) {
        const len = line.getTotalLength();
        gsap.set(line, { strokeDasharray: len, strokeDashoffset: len });
        ScrollTrigger.create({
          trigger: ".hm-four",
          start: "top 70%",
          once: true,
          onEnter: () => gsap.to(line, { strokeDashoffset: 0, duration: 1.4, ease: "power2.inOut" }),
        });
      }

      // 5. the analytics bars grow to their value
      root.querySelectorAll<HTMLElement>(".hm-bars").forEach((list) => {
        const fills = list.querySelectorAll<HTMLElement>(".hm-bar i");
        gsap.set(fills, { scaleX: 0, transformOrigin: "left center" });
        ScrollTrigger.create({
          trigger: list,
          start: "top 80%",
          once: true,
          onEnter: () => gsap.to(fills, { scaleX: 1, duration: 0.7, ease: EASE, stagger: 0.08 }),
        });
      });
    }, root);

    return () => {
      ctx.revert();
      delete root.dataset.motion;
    };
  }, []);

  return null;
}

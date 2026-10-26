"use client";

// One place the landing page's motion is configured. Everything that moves
// on the page uses the same curve (ease-out-quint, measured on the
// reference) and reads the same reduced-motion answer, so the page has one
// motion language rather than six.

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

/** The page's one easing: cubic-bezier(0.23, 1, 0.32, 1). */
export const EASE = "expo.out";

export const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export { gsap, ScrollTrigger, SplitText };

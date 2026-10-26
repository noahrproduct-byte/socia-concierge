"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

// One registration for the page's motion. Everything scroll-driven on the
// landing page goes through here, so the plugins register once and the
// two gates (reduced motion, narrow screens) are decided in one place.

gsap.registerPlugin(ScrollTrigger, SplitText);

export const EASE = "expo.out";
export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// phones get the finished compositions with no pinning: a pinned, scrubbed
// sequence is a desktop idea, and a phone needs the page to just scroll
export const narrow = () => matchMedia("(max-width: 760px)").matches;
export const still = () => reduced() || narrow();

export { gsap, ScrollTrigger, SplitText };

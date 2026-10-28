"use client";

// The content area, and the hand-over between sections. When the person
// moves to another section the page they are leaving fades out and slides
// 10px one way while the destination fades in from 10px the other way (the
// direction follows the menu order), with a barely-there scale on the way in.
//
// Nothing waits for the animation. The outgoing page is a frozen copy of the
// content area, taken at the moment the person clicks a link, goes back or
// forward, or picks a page in the command menu, and laid over the new page
// only while it fades out. The real route change happens exactly as before,
// so loading states, history, direct URLs and keyboard use are untouched.
// The headbar sits outside this element and never moves. The first load,
// hash and query changes, and reduced motion get no animation. Both halves
// are Web Animations, so they leave no styles behind.

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { navIndex } from "@/lib/nav";

const IN_MS = 440;
const OUT_MS = 300;
// The same curve as --ease-out in app/styles/tokens.css.
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
// A copy older than this belongs to a click that never became a navigation.
const STALE_MS = 8000;

type Outgoing = { node: HTMLElement; rect: DOMRect; from: string; at: number };
let outgoing: Outgoing | null = null;
// The path on screen. Not location.pathname: on back and forward the URL has
// already changed by the time the popstate event fires.
let shownPath: string | null = null;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Freeze the current page so it can fade out over the next one. Call just before a navigation to `href`. */
export function captureOutgoingPage(href?: string) {
  if (typeof window === "undefined" || reducedMotion()) return;
  if (href) {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname === (shownPath ?? window.location.pathname)) return;
  }
  const main = document.querySelector<HTMLElement>("main.s-content");
  if (!main) return;
  outgoing = { node: main.cloneNode(true) as HTMLElement, rect: main.getBoundingClientRect(), from: shownPath ?? window.location.pathname, at: Date.now() };
}

/** Lay the frozen page over the viewport where it was and fade it out. Returns a cancel. */
function playOut(o: Outgoing, dx: number): () => void {
  const frame = document.createElement("div");
  frame.setAttribute("aria-hidden", "true");
  frame.inert = true;
  // Fixed in the viewport, so the copy stays exactly where the person saw it
  // even though the new page starts scrolled to the top. Below the headbar.
  Object.assign(frame.style, {
    position: "fixed",
    top: "0",
    left: `${o.rect.left}px`,
    width: `${o.rect.width}px`,
    height: "100vh",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "20",
  });
  Object.assign(o.node.style, { position: "absolute", top: `${o.rect.top}px`, left: "0", width: `${o.rect.width}px`, margin: "0" });
  frame.appendChild(o.node);
  document.body.appendChild(frame);
  const run = frame.animate(
    [
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: `translateX(${-dx}px)` },
    ],
    { duration: OUT_MS, easing: EASE, fill: "forwards" },
  );
  run.finished.then(
    () => frame.remove(),
    () => frame.remove(),
  );
  return () => {
    run.cancel();
    frame.remove();
  };
}

export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  const previous = useRef(pathname);

  // Take the copy before the route changes: link clicks (capture phase, ahead
  // of the router) and the browser's back and forward.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return;
      captureOutgoingPage(a.href);
    };
    const onPop = () => captureOutgoingPage();
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    shownPath = pathname;
    const o = outgoing;
    outgoing = null;
    const el = ref.current;
    if (!el || from === pathname || reducedMotion()) return;
    // Further along the menu comes in from the right, back along it from the left.
    const a = navIndex(from);
    const b = navIndex(pathname);
    const dx = a >= 0 && b >= 0 && b < a ? -10 : 10;
    const stopOut = o && o.from === from && Date.now() - o.at < STALE_MS ? playOut(o, dx) : null;
    const run = el.animate(
      [
        { opacity: 0, transform: `translateX(${dx}px) scale(0.995)` },
        { opacity: 1, transform: "none" },
      ],
      { duration: IN_MS, delay: 60, easing: EASE, fill: "backwards" },
    );
    return () => {
      run.cancel();
      stopOut?.();
    };
  }, [pathname]);

  return (
    <main ref={ref} className="s-content">
      {children}
    </main>
  );
}

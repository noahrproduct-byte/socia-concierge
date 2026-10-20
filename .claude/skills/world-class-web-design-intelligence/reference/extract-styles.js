// Run with the browser's javascript_tool on a reference page. Read-only: it
// only measures what the page already renders. Returns the page's real design
// tokens so an entry records measured values, not impressions.
(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  };
  const els = [...document.querySelectorAll("body *")].filter(vis).slice(0, 1500);
  const tally = (pick) => {
    const m = new Map();
    for (const el of els) { const v = pick(el, getComputedStyle(el)); if (v) m.set(v, (m.get(v) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([v, n]) => `${v} ×${n}`);
  };
  const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);

  // CSS custom properties declared on :root (design tokens, when the site uses them).
  const tokens = {};
  for (const sheet of [...document.styleSheets]) {
    let rules; try { rules = sheet.cssRules; } catch { continue; } // cross-origin sheets can't be read
    for (const r of [...rules]) {
      if (r.selectorText === ":root" && r.style) for (const p of [...r.style]) if (p.startsWith("--") && Object.keys(tokens).length < 80) tokens[p] = r.style.getPropertyValue(p).trim();
    }
  }

  const sample = (sel) => {
    const el = [...document.querySelectorAll(sel)].find(vis);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { text: (el.textContent || "").trim().slice(0, 40), font: `${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily.split(",")[0]}`, letterSpacing: cs.letterSpacing, color: cs.color, bg: cs.backgroundColor, radius: cs.borderRadius, padding: cs.padding, border: cs.border, shadow: cs.boxShadow, transition: cs.transition };
  };

  return {
    url: location.href,
    viewport: `${innerWidth}x${innerHeight}`,
    fontsLoaded: [...new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`))].slice(0, 20),
    typeScale: tally((el, cs) => hasText(el) ? cs.fontSize : null),
    weights: tally((el, cs) => hasText(el) ? cs.fontWeight : null),
    lineHeights: tally((el, cs) => hasText(el) ? `${cs.fontSize}/${cs.lineHeight}` : null),
    letterSpacing: tally((el, cs) => hasText(el) && cs.letterSpacing !== "normal" ? `${cs.fontSize} ${cs.letterSpacing}` : null),
    textColors: tally((el, cs) => hasText(el) ? cs.color : null),
    backgrounds: tally((el, cs) => cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : null),
    radii: tally((el, cs) => cs.borderRadius !== "0px" ? cs.borderRadius : null),
    borders: tally((el, cs) => cs.borderTopWidth !== "0px" && cs.borderTopStyle !== "none" ? `${cs.borderTopWidth} ${cs.borderTopColor}` : null),
    shadows: tally((el, cs) => cs.boxShadow !== "none" ? cs.boxShadow : null),
    motion: tally((el, cs) => cs.transitionDuration !== "0s" ? `${cs.transitionProperty} ${cs.transitionDuration} ${cs.transitionTimingFunction}` : null),
    animations: tally((el, cs) => cs.animationName !== "none" ? `${cs.animationName} ${cs.animationDuration} ${cs.animationTimingFunction}` : null),
    icons: { svgs: els.filter((e) => e.tagName === "svg").length, sizes: tally((el) => el.tagName === "svg" ? `${Math.round(el.getBoundingClientRect().width)}px stroke ${el.getAttribute("stroke-width") || getComputedStyle(el).strokeWidth}` : null) },
    samples: { body: sample("body"), h1: sample("h1"), h2: sample("h2"), nav: sample("nav a, header a"), button: sample("button, a[class*='button'], a[class*='btn']"), input: sample("input:not([type=hidden])") },
    rootTokens: tokens,
    reducedMotionQuery: matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
})();

// "Don't count me" for Vercel Web Analytics (components/SiteAnalytics.tsx):
// a per-browser flag in localStorage, set by ?dont-count-me and cleared by
// ?count-me. Pure helpers, safe when storage is blocked.

export const OPT_OUT_KEY = "va-disable";
export const OPT_OUT_PARAM = "dont-count-me";
export const OPT_IN_PARAM = "count-me";

/** Apply ?dont-count-me / ?count-me to this browser; returns what changed. Exported for tests. */
export function applyOptParam(search: string, store: Pick<Storage, "setItem" | "removeItem">): "out" | "in" | null {
  const q = new URLSearchParams(search);
  try {
    if (q.has(OPT_OUT_PARAM)) { store.setItem(OPT_OUT_KEY, "1"); return "out"; }
    if (q.has(OPT_IN_PARAM)) { store.removeItem(OPT_OUT_KEY); return "in"; }
  } catch {
    /* storage blocked: nothing saved */
  }
  return null;
}

/** Whether this browser asked not to be counted. Exported for tests. */
export function optedOut(store: Pick<Storage, "getItem"> | null): boolean {
  try {
    return Boolean(store?.getItem(OPT_OUT_KEY));
  } catch {
    return false;
  }
}

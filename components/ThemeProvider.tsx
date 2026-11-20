"use client";

// Appearance: Light, Dark or System (lib/appearance.ts). The head script
// (lib/themeScript.ts) paints the saved choice before React runs; this
// provider owns the choice after that: it paints again after hydration (React
// may re-render <html> when it recovers from a mismatch), follows the device
// while the choice is System, and saves a new choice on the device and, for a
// signed-in person, on their profile.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, THEME_COLOR, isAppearance, isLightOnly, resolveAppearance, type Appearance, type Resolved } from "@/lib/appearance";
export { isAppearance, type Appearance, type Resolved } from "@/lib/appearance";

/** Paint the theme on <html>: data attribute (tokens), `dark` class (Tailwind
 *  variant), color-scheme (native controls), browser chrome color. */
export function applyResolved(resolved: Resolved) {
  const el = document.documentElement;
  el.dataset.theme = resolved;
  el.classList.toggle("dark", resolved === "dark");
  el.style.colorScheme = resolved;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]:not([media])').forEach((m) => {
    m.content = THEME_COLOR[resolved];
  });
}

const readSaved = (): Appearance => {
  try {
    const v = localStorage.getItem(APPEARANCE_KEY);
    return isAppearance(v) ? v : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
};

const systemDark = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);

type Ctx = {
  appearance: Appearance;
  resolved: Resolved;
  ready: boolean;
  /** Choose and save. `save: false` only paints and keeps it on the device (the profile's copy arriving). */
  setAppearance: (a: Appearance, opts?: { save?: boolean }) => void;
};

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setState] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [resolved, setResolved] = useState<Resolved>("light");
  const [ready, setReady] = useState(false);
  // The public site keeps its light design whatever the choice (lib/appearance.ts isLightOnly).
  const pathname = usePathname() ?? "/";
  const lightOnly = isLightOnly(pathname);

  // The saved choice, after hydration.
  useEffect(() => {
    const a = readSaved();
    setState(a);
    setResolved(resolveAppearance(a, systemDark()));
    setReady(true);
  }, []);

  // Paint what the page should show: again after hydration, on every choice, and on moving between the app and the public site.
  useEffect(() => {
    if (ready) applyResolved(lightOnly ? "light" : resolved);
  }, [ready, resolved, lightOnly]);

  // System: follow the device while the page is open.
  useEffect(() => {
    if (appearance !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setResolved(mq.matches ? "dark" : "light");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [appearance]);

  const setAppearance = useCallback((a: Appearance, opts: { save?: boolean } = {}) => {
    setState(a);
    setResolved(resolveAppearance(a, systemDark()));
    try { localStorage.setItem(APPEARANCE_KEY, a); } catch { /* private mode: this page only */ }
    if (opts.save !== false) {
      // Signed out (the public site), the profile answers 401 and the device copy stands.
      void fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appearance: a }) }).catch(() => null);
    }
  }, []);

  return <ThemeContext.Provider value={{ appearance, resolved, ready, setAppearance }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

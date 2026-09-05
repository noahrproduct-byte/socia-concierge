"use client";

// Appearance: light / dark / system. The preference lives in localStorage for
// instant paint (a blocking script in <head> applies it before React runs),
// and on the signed-in user's profile so it follows them across devices.
// `system` tracks prefers-color-scheme live; an explicit choice never does.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Appearance = "light" | "dark" | "system";
export type Resolved = "light" | "dark";

export const APPEARANCE_KEY = "socia-appearance";
export const THEME_COLOR: Record<Resolved, string> = { light: "#f5f6fa", dark: "#0b1220" };

export const isAppearance = (v: unknown): v is Appearance => v === "light" || v === "dark" || v === "system";

function systemResolved(): Resolved {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveAppearance(a: Appearance): Resolved {
  return a === "system" ? systemResolved() : a;
}

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

/** A restrained 200ms crossfade of colors while the theme flips. */
function withTransition(fn: () => void) {
  const el = document.documentElement;
  el.classList.add("theme-switching");
  fn();
  window.setTimeout(() => el.classList.remove("theme-switching"), 260);
}

function readStored(): Appearance {
  try {
    const v = localStorage.getItem(APPEARANCE_KEY);
    return isAppearance(v) ? v : "system";
  } catch {
    return "system";
  }
}

type Ctx = {
  appearance: Appearance;
  resolved: Resolved;
  /** Apply immediately, remember on this device, and save to the account. */
  setAppearance: (a: Appearance) => void;
  /** True once the client has read the stored preference (avoids SSR guesses). */
  ready: boolean;
};

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance>("system");
  const [resolved, setResolved] = useState<Resolved>("light");
  const [ready, setReady] = useState(false);

  // Read what the head script already applied, and apply it again: if React
  // had to recover from a hydration mismatch it re-renders <html> and drops
  // the attributes the script set. This runs right after hydration.
  useEffect(() => {
    const a = readStored();
    const r = resolveAppearance(a);
    setAppearanceState(a);
    setResolved(r);
    applyResolved(r);
    setReady(true);
  }, []);

  // The account's saved preference (ThemeSync) arrives as an event.
  useEffect(() => {
    const on = (e: Event) => {
      const a = (e as CustomEvent).detail;
      if (!isAppearance(a)) return;
      setAppearanceState(a);
      setResolved(resolveAppearance(a));
    };
    window.addEventListener("socia-appearance", on);
    return () => window.removeEventListener("socia-appearance", on);
  }, []);

  // System mode follows the OS live; explicit choices ignore it.
  useEffect(() => {
    if (appearance !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const r = systemResolved();
      setResolved(r);
      withTransition(() => applyResolved(r));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [appearance]);

  const setAppearance = useCallback((a: Appearance) => {
    const r = resolveAppearance(a);
    setAppearanceState(a);
    setResolved(r);
    withTransition(() => applyResolved(r));
    try {
      localStorage.setItem(APPEARANCE_KEY, a);
    } catch {
      /* private mode: the account copy still saves */
    }
    // Account-level copy, best effort; the device copy already took effect.
    fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appearance: a }),
    }).catch(() => {});
  }, []);

  const value = useMemo(() => ({ appearance, resolved, setAppearance, ready }), [appearance, resolved, setAppearance, ready]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

/**
 * Brings the account's saved preference onto this device. Rendered by the app
 * shell with the value from the profile row: when it differs from what this
 * device last used, the account wins (it is the user's most recent explicit
 * choice anywhere) and the device copy is updated.
 */
export function ThemeSync({ appearance }: { appearance: Appearance | null }) {
  const { appearance: local, ready } = useTheme();
  useEffect(() => {
    if (!ready || !appearance || appearance === local) return;
    try {
      localStorage.setItem(APPEARANCE_KEY, appearance);
    } catch {
      /* ignore */
    }
    applyResolved(resolveAppearance(appearance));
    // Re-read into context without a network save (it came from the account).
    window.dispatchEvent(new CustomEvent("socia-appearance", { detail: appearance }));
  }, [appearance, local, ready]);
  return null;
}

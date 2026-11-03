"use client";

// Appearance: SOCIA is light only (lib/appearance.ts). The head script
// (lib/themeScript.ts) paints the light theme before React runs; this provider
// paints it again after hydration, in case React recovered from a hydration
// mismatch and re-rendered <html> without the attributes the script set.

import { createContext, useContext, useEffect, useState } from "react";
import { APPEARANCE_KEY, THEME_COLOR, type Resolved } from "@/lib/appearance";

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

type Ctx = { resolved: Resolved; ready: boolean };

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    applyResolved("light");
    // A choice saved before the app went light only would otherwise sit unused on the device.
    try {
      localStorage.removeItem(APPEARANCE_KEY);
    } catch {
      /* private mode */
    }
    setReady(true);
  }, []);

  return <ThemeContext.Provider value={{ resolved: "light", ready }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

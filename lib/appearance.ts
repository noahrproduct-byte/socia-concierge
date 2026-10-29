// Appearance preference: shared by the client ThemeProvider and server code
// (AppShell, the profile API). No "use client" here on purpose, so server
// components can call these without crossing the client boundary.

export type Appearance = "light" | "dark" | "system";
export type Resolved = "light" | "dark";

export const APPEARANCE_KEY = "socia-appearance";
export const THEME_COLOR: Record<Resolved, string> = { light: "#f5f4f1", dark: "#0b0d10" };

export const isAppearance = (v: unknown): v is Appearance =>
  v === "light" || v === "dark" || v === "system";

/** Paths that keep the old default (follow the system): the public site and auth, which have their own looks. */
const PUBLIC_PREFIXES = ["/login", "/signup", "/reset-password", "/pricing", "/privacy", "/terms", "/oauth", "/scorer", "/auth"];

/**
 * The appearance for someone who has never chosen one. Inside the app it is
 * light (Noah's light reference, 2026-10-28, replacing the dark default of
 * the same morning); the public site and auth pages keep following the
 * system. An explicit choice (Settings, Appearance) always wins.
 */
export function defaultAppearance(pathname: string): Appearance {
  if (pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return "system";
  return "light";
}

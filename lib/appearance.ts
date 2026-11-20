// Appearance: shared by the client ThemeProvider and the theme script. No
// "use client" here on purpose, so server code can import it too.
//
// Light, Dark or System (Noah, 2026-11-19; light only from 2026-11-03 until
// then). The choice is kept on the device (localStorage, read by the head
// script before first paint so the page never flashes the wrong theme) and on
// the person's profile (profiles.appearance), so it follows them to another
// device once they sign in. Nothing chosen yet means Light, SOCIA's default.
// The public site (home, pricing, legal pages) keeps its own light design.

export type Appearance = "light" | "dark" | "system";
export type Resolved = "light" | "dark";

export const APPEARANCE_KEY = "socia-appearance";
export const DEFAULT_APPEARANCE: Appearance = "light";
export const THEME_COLOR: Record<Resolved, string> = { light: "#f5f4f1", dark: "#0b0b0c" };

export const isAppearance = (v: unknown): v is Appearance =>
  v === "light" || v === "dark" || v === "system";

/** What a choice paints, given whether the device prefers dark. Pure. */
export const resolveAppearance = (a: Appearance, systemDark: boolean): Resolved =>
  a === "system" ? (systemDark ? "dark" : "light") : a;

/**
 * Pages of the public site, which keep their own light design whatever the
 * choice: the homepage, pricing, legal pages, sign-in and sign-up. The theme
 * script repeats this pattern as a string (lib/themeScript.ts).
 */
export const LIGHT_ONLY_PATTERN = "^/($|pricing|privacy|terms|data-deletion|login|signup|forgot-password|reset-password|auth|l/|invite|oauth)";
export const isLightOnly = (pathname: string): boolean => new RegExp(LIGHT_ONLY_PATTERN).test(pathname);

export const APPEARANCE_LABEL: Record<Appearance, string> = { light: "Light", dark: "Dark", system: "System" };

// Appearance: shared by the client ThemeProvider and the theme script. No
// "use client" here on purpose, so server code can import it too.
//
// SOCIA is light only for now (2026-11-03): every page, the public site
// included, paints the light tokens and there is no picker. The dark values
// are kept in app/styles/tokens.css and the profiles.appearance column is
// left in place, so a dark mode can return without a migration.

export type Appearance = "light" | "dark" | "system";
export type Resolved = "light" | "dark";

export const APPEARANCE_KEY = "socia-appearance";
export const THEME_COLOR: Record<Resolved, string> = { light: "#f5f4f1", dark: "#0b0d10" };

export const isAppearance = (v: unknown): v is Appearance =>
  v === "light" || v === "dark" || v === "system";

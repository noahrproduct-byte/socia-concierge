// Appearance preference: shared by the client ThemeProvider and server code
// (AppShell, the profile API). No "use client" here on purpose, so server
// components can call these without crossing the client boundary.

export type Appearance = "light" | "dark" | "system";
export type Resolved = "light" | "dark";

export const APPEARANCE_KEY = "socia-appearance";
export const THEME_COLOR: Record<Resolved, string> = { light: "#f5f6fa", dark: "#0b1220" };

export const isAppearance = (v: unknown): v is Appearance =>
  v === "light" || v === "dark" || v === "system";

import localFont from "next/font/local";

// Instrument Serif (SIL Open Font License 1.1, see ./README.md), served from
// the site itself rather than fetched from Google Fonts at build time: a bad
// response from Google during a production build failed the deploy of
// 2026-11-12. Regular and italic, Latin only. Used by the marketing pages'
// headings (components/home/fonts.ts) and the intro film's "Introducing".
export const instrumentSerif = localFont({
  src: [
    { path: "./InstrumentSerif-Regular.woff2", weight: "400", style: "normal" },
    { path: "./InstrumentSerif-Italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument-serif",
  display: "swap",
  fallback: ["Iowan Old Style", "Palatino Linotype", "Georgia", "serif"],
});

/** Instrument Sans SemiBold (same license, same designers), the headline face the serif is drawn to pair with. */
export const instrumentSans = localFont({
  src: [{ path: "./InstrumentSans-SemiBold.woff2", weight: "600", style: "normal" }],
  variable: "--font-instrument-sans",
  display: "swap",
  fallback: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
});

/**
 * Instrument Sans at every weight (the variable font, Latin subset, same
 * license): the app's heading face since the 2026-11-17 redesign. Page
 * titles, headlines and headline figures are set in it at 400 to 500 with
 * tight tracking, the way the reference sets its display type light; Inter
 * stays the reading and interface face.
 */
export const instrumentSansHeading = localFont({
  src: [{ path: "./InstrumentSans-Latin.woff2", weight: "400 700", style: "normal" }],
  variable: "--font-heading-face",
  display: "swap",
  fallback: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
});


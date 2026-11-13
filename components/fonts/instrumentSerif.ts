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

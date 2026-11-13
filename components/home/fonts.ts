import { Geist_Mono, Instrument_Serif } from "next/font/google";

// The marketing pages' faces (homepage and pricing). Inter comes from the root
// layout (--font-sans) and stays the reading face; Instrument Serif is the
// display face for section headings, the same family the intro film's
// "Introducing" is set in; Geist Mono sets the small technical labels. The app
// itself never loads these.
export const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono" });
export const displaySerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-hm-display" });

/** Both variables, for the page's root element. */
export const marketingFonts = `${geistMono.variable} ${displaySerif.variable}`;

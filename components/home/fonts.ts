import { Geist_Mono } from "next/font/google";
import { instrumentSerif } from "@/components/fonts/instrumentSerif";

// The marketing pages' faces (homepage and pricing). Inter comes from the root
// layout (--font-sans) and stays the reading face; Instrument Serif is the
// display face for section headings (served from the site, see
// components/fonts), the same family the intro film's "Introducing" is set
// in; Geist Mono sets the small technical labels. The app never loads these.
export const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono" });

/** Both variables, for the page's root element. */
export const marketingFonts = `${geistMono.variable} ${instrumentSerif.variable}`;

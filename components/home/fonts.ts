import { Geist_Mono } from "next/font/google";
import { instrumentSans, instrumentSerif } from "@/components/fonts/instrumentSerif";

// The marketing pages' faces (homepage and pricing). Inter comes from the root
// layout (--font-sans) and stays the reading face; headlines pair Instrument
// Sans SemiBold with an Instrument Serif italic phrase (served from the site,
// see components/fonts; the serif is also the intro film's "Introducing");
// Geist Mono sets the small technical labels. The app never loads these.
export const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono" });

/** Both variables, for the page's root element. */
export const marketingFonts = `${geistMono.variable} ${instrumentSerif.variable} ${instrumentSans.variable}`;

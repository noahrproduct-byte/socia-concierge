import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import ThemeScript from "@/components/ThemeScript";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const SITE_URL = "https://sociaos.com";
const SITE_TITLE = "SOCIA | Your AI Social Strategist";
const SITE_DESCRIPTION =
  "SOCIA studies your content, audience and competitors, then tells you what to post, why it should work, and when to publish.";

export const metadata: Metadata = {
  // Default for any page without its own title — user-facing, never the
  // internal codename (it was leaking into tab titles on auth pages).
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: "SOCIA",
    type: "website",
    url: SITE_URL,
    images: ["/brand/socia-mark.png"],
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/brand/socia-mark.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // suppressHydrationWarning: the head script sets data-theme / .dark on <html>
  // before React hydrates, so the server markup and the client differ there on
  // purpose. Everything below <html> hydrates normally.
  return (
    <html lang="en" className={cn("font-sans", inter.variable)} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#f5f6fa" />
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import ThemeScript from "@/components/ThemeScript";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// The public origin, used to resolve Open Graph / Twitter image URLs to
// absolute (link unfurlers require that). Falls back to the production domain.
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://sociaos.com";
const TAGLINE =
  "SOCIA studies your content, audience and competitors, then tells you what to post, why it should work, and when to publish.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Default for any page without its own title — user-facing, never the
  // internal codename (it was leaking into tab titles on auth pages).
  title: "SOCIA — Your AI Social Strategist",
  description: TAGLINE,
  applicationName: "SOCIA",
  // Let unfurlers (Slack, iMessage, X, LinkedIn) show a real card. The image
  // comes from the file-convention app/opengraph-image.tsx, injected by Next.
  openGraph: {
    type: "website",
    siteName: "SOCIA",
    url: SITE_URL,
    title: "SOCIA — Your AI Social Strategist",
    description: TAGLINE,
  },
  twitter: {
    card: "summary_large_image",
    title: "SOCIA — Your AI Social Strategist",
    description: TAGLINE,
  },
  robots: { index: true, follow: true },
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

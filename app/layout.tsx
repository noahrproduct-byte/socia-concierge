import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import ThemeScript from "@/components/ThemeScript";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "SOCIA — Concierge Engine",
  description:
    "Generate an audit, competitor breakdown, and weekly content plan for a client account.",
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

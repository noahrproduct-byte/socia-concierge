import type { Metadata } from "next";
import "./globals.css";

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
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

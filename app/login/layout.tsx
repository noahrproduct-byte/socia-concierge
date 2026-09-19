import type { Metadata } from "next";

// The page itself is a client component, so the tab title lives here.
export const metadata: Metadata = { title: "Log in | SOCIA" };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

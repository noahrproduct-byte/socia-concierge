import type { Metadata } from "next";

// The page itself is a client component, so the tab title lives here.
export const metadata: Metadata = { title: "Reset password | SOCIA" };

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

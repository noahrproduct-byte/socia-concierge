import type { Metadata } from "next";

// The page itself is a client component, so the tab title lives here.
export const metadata: Metadata = { title: "Set a new password | SOCIA" };

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

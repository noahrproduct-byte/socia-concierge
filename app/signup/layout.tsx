import type { Metadata } from "next";

// The page itself is a client component, so the tab title lives here.
export const metadata: Metadata = { title: "Sign up | SOCIA" };

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

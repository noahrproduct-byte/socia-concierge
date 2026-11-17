import type { ReactNode } from "react";
import HomeNav from "@/components/home/HomeNav";
import HomeFooter from "@/components/home/HomeFooter";
import { marketingFonts } from "@/components/home/fonts";
import "@/components/home/home.css";

// The frame of the legal pages (Terms, Privacy, Data deletion): the public
// site's own top bar and footer around the text, so a reader always knows
// whose page this is and can get back to the site. The bar is the signed-out
// one on purpose: these pages are the same for everyone, so they stay static,
// and "Log in" takes a signed-in person straight to their dashboard.
export default function LegalShell({ children }: { children: ReactNode }) {
  return (
    <div className={`${marketingFonts} hm legal-frame`}>
      <HomeNav signedIn={false} current="/legal" />
      <main className="legal-page">{children}</main>
      <HomeFooter onHome={false} />
    </div>
  );
}

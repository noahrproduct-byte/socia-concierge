import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { CONTACT_EMAIL } from "@/lib/plans";

// The public pages' footer (homepage and pricing). Section links point at the
// homepage's sections, as anchors on the homepage itself.

export default function HomeFooter({ onHome = true }: { onHome?: boolean }) {
  const home = onHome ? "" : "/";
  return (
    <footer className="hm-footer">
      <div className="hm-wrap">
        <div className="hm-footer-grid">
          <div className="hm-footer-brand">
            <Link href="/" className="hm-brand">
              <BrandMark size={22} /> SOCIA
            </Link>
            <p className="hm-small">
              SOCIA studies your content, audience and competitors, then tells you what to post, why it should work and
              when to publish.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><Link href="/pricing">Pricing</Link></li>
              <li><a href={`${home}#how`}>How it works</a></li>
              <li><a href={`${home}#platforms`}>Platforms</a></li>
              <li><a href={`${home}#assistants`}>AI assistants</a></li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li><a href={`mailto:${CONTACT_EMAIL}`}>Contact</a></li>
              <li><Link href="/privacy">Privacy</Link></li>
              <li><Link href="/terms">Terms</Link></li>
              <li><Link href="/login">Log in</Link></li>
            </ul>
          </div>
        </div>
        <div className="hm-footer-foot">
          <p className="hm-meta">
            <span>&copy; 2026 SOCIA</span>
            <span>sociaos.com</span>
            <span>Instagram, Facebook, YouTube and TikTok are trademarks of their owners</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

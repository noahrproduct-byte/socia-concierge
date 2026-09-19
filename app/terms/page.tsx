import Link from "next/link";
import BrandMark from "@/components/BrandMark";

export const metadata = { title: "Terms of Service | SOCIA" };

export default function TermsPage() {
  return (
    <main className="legal-page">
      <header className="legal-top">
        <Link href="/" className="legal-brand" aria-label="SOCIA home">
          <BrandMark size={28} />
          <span>SOCIA</span>
        </Link>
        <Link href="/login" className="btn-secondary legal-login">Log in</Link>
      </header>

      <h1>Terms of Service</h1>
      <p className="legal-date">Last updated: September 4, 2026</p>

      <p>
        These terms govern your use of SOCIA, an AI social media strategist.
        By creating an account you agree to them.
      </p>

      <h2>What SOCIA is</h2>
      <p>
        SOCIA analyzes social media accounts you connect, reviews content
        before you post it, and helps you plan and schedule posts. SOCIA is currently
        in beta: features change, and some platform integrations operate in
        test modes with limitations imposed by those platforms.
      </p>

      <h2>Your account and your content</h2>
      <ul>
        <li>You must own or have the right to manage every social account you connect.</li>
        <li>
          You keep all rights to your content. You give SOCIA permission to
          process it, including sending it to AI services for analysis, solely
          to provide the product to you.
        </li>
        <li>
          You are responsible for what you publish. SOCIA schedules and posts
          on your instruction; the content and its compliance with each
          platform&apos;s rules remain yours.
        </li>
      </ul>

      <h2>Honest limitations</h2>
      <p>
        SOCIA&apos;s scores and recommendations are produced from your own
        data and from public platform data; where SOCIA cites a benchmark it
        says where the figure comes from. They are decision support, not
        guarantees, and SOCIA does not predict views or growth. Social platforms change their
        algorithms without notice, and no tool can promise reach or growth.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Don&apos;t use SOCIA to publish content that is unlawful or that
        violates the rules of the platforms it posts to, don&apos;t attempt to
        access other users&apos; data, and don&apos;t resell access without an
        agreement with us.
      </p>

      <h2>Termination</h2>
      <p>
        You can stop using SOCIA and request deletion of your data at any time
        (see the <Link href="/privacy">Privacy Policy</Link>). We may suspend
        accounts that violate these terms.
      </p>

      <h2>Liability</h2>
      <p>
        SOCIA is provided &quot;as is&quot; during beta. To the maximum extent
        permitted by law, we are not liable for indirect damages, lost profits,
        or platform actions (such as reach limitations or account restrictions)
        arising from use of the product.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:socia.app2026@gmail.com">socia.app2026@gmail.com</a>
        {" · "}
        <Link href="/privacy">Privacy Policy</Link>
      </p>
    </main>
  );
}

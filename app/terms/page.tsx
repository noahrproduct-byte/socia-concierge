import Link from "next/link";

export const metadata = { title: "Terms of Service — SOCIA" };

export default function TermsPage() {
  return (
    <main className="legal-page">
      <style>{`
        .legal-page { max-width: 720px; margin: 0 auto; padding: 64px 24px 96px;
          font-size: 15.5px; line-height: 1.7; color: #1a1d24; }
        .legal-page h1 { font-size: 32px; letter-spacing: -.5px; margin: 0 0 4px; }
        .legal-page .legal-date { color: #6b7280; font-size: 13.5px; margin-bottom: 36px; }
        .legal-page h2 { font-size: 19px; margin: 34px 0 10px; letter-spacing: -.2px; }
        .legal-page p, .legal-page li { color: #3d4351; }
        .legal-page ul { padding-left: 22px; }
        .legal-page a { color: #2563ff; }
      `}</style>

      <h1>Terms of Service</h1>
      <p className="legal-date">Last updated: September 4, 2026</p>

      <p>
        These terms govern your use of SOCIA, an AI social media strategist.
        By creating an account you agree to them.
      </p>

      <h2>What SOCIA is</h2>
      <p>
        SOCIA analyzes social media accounts you connect, scores content before
        you post it, and helps you plan and schedule posts. SOCIA is currently
        in beta: features change, and some platform integrations operate in
        test modes with limitations imposed by those platforms.
      </p>

      <h2>Your account and your content</h2>
      <ul>
        <li>You must own or have the right to manage every social account you connect.</li>
        <li>
          You keep all rights to your content. You give SOCIA permission to
          process it — including sending it to AI services for analysis — solely
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
        SOCIA&apos;s scores, predictions and recommendations are estimates
        produced by AI against published benchmarks and your own data. They are
        decision support, not guarantees. Social platforms change their
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

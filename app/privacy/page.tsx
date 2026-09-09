import Link from "next/link";

export const metadata = { title: "Privacy Policy — SOCIA" };

// Required by TikTok and Meta app review, and owed to users regardless.
// Plain-language on purpose: it describes what the app actually does today.
// Update the date whenever the substance changes.
export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <h1>Privacy Policy</h1>
      <p className="legal-date">Last updated: September 4, 2026</p>

      <p>
        SOCIA is an AI social media strategist. This policy describes what
        information SOCIA collects, why, and what happens to it. It is written
        to be read, not skimmed past.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <b>Account information</b>: your email address and password (stored
          hashed), used to sign you in.
        </li>
        <li>
          <b>Connected social accounts</b>: when you connect Instagram or a
          Facebook Page, we receive access tokens from Meta and read the data
          you authorize on their consent screen: your profile, follower counts,
          your posts and their performance metrics. We only access accounts
          you explicitly connect. YouTube data shown in SOCIA comes from
          YouTube&apos;s public API and needs no connection. TikTok is not
          connected to SOCIA today.
        </li>
        <li>
          <b>Content you submit</b>: captions, drafts and videos you ask SOCIA
          to score or schedule. Video files in Content Studio are analyzed
          from frames sampled in your browser; the video file itself is not
          uploaded to our servers unless you schedule it for publishing.
        </li>
        <li>
          <b>Profile details you provide</b>: your niche, goals and brand
          settings, used to personalize analysis.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To analyze your account and generate scores, plans and recommendations.</li>
        <li>To publish content you schedule, at the time you schedule it.</li>
        <li>To operate, debug and improve the product.</li>
      </ul>
      <p>
        Analysis is performed with AI services (Anthropic Claude). The content
        being analyzed is sent to those services for processing. We do not sell
        your data, and we do not use your data to advertise to you.
      </p>

      <h2>Where it lives</h2>
      <p>
        Data is stored with Supabase (database and authentication) and the app
        is hosted on Vercel. Access tokens for connected platforms are stored
        server-side and never exposed to your browser or other users.
      </p>

      <h2>Deleting your data</h2>
      <p>
        Disconnecting a social account in Settings deletes its stored tokens,
        the synced profile and posts, and the daily snapshots for that account.
        Removing SOCIA from your Instagram or Facebook settings triggers the
        same deletion automatically through Meta&apos;s deletion callback; see{" "}
        <Link href="/data-deletion">Data deletion</Link> for the steps and to
        check a confirmation code. To delete your SOCIA account and all
        associated data, email{" "}
        <a href="mailto:socia.app2026@gmail.com">socia.app2026@gmail.com</a>{" "}
        from the address you signed up with and we will remove it within 30
        days.
      </p>

      <h2>Third-party platforms</h2>
      <p>
        Your use of Instagram, Facebook and YouTube through SOCIA is also
        governed by those platforms&apos; own terms and privacy policies. SOCIA
        accesses them only through their official APIs, and for Instagram and
        Facebook only with the permissions you grant on Meta&apos;s consent
        screen.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes materially, the date above changes with it and
        we will note it in the product.
      </p>

      <p>
        Questions:{" "}
        <a href="mailto:socia.app2026@gmail.com">socia.app2026@gmail.com</a>
        {" · "}
        <Link href="/terms">Terms of Service</Link>
      </p>
    </main>
  );
}

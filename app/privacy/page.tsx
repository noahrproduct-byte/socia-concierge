import Link from "next/link";

export const metadata = { title: "Privacy Policy — SOCIA" };

// Required by TikTok and Meta app review, and owed to users regardless.
// Plain-language on purpose: it describes what the app actually does today.
// Update the date whenever the substance changes.
export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <h1>Privacy Policy</h1>
      <p className="legal-date">Last updated: September 24, 2026</p>

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
          your posts and their performance metrics. When you connect your own
          YouTube channel, we receive OAuth tokens from Google and read, with
          read-only permissions (<code>youtube.readonly</code>,{" "}
          <code>yt-analytics.readonly</code>), your channel details and your own
          YouTube analytics &mdash; views, watch time, subscriber changes,
          recent videos and the age breakdown of your viewers &mdash; solely to
          show them back to you in SOCIA. If you grant the YouTube upload
          permission, we use it only to publish a video you explicitly schedule.
          We only access accounts you explicitly connect, and you can disconnect
          any of them at any time. TikTok is not connected to SOCIA today.
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

      <h2>How we protect your data</h2>
      <p>
        We treat connected-account access tokens and the profile, content and
        analytics data we read on your behalf as sensitive, and protect them
        with the following mechanisms:
      </p>
      <ul>
        <li>
          <b>Encryption in transit</b>: all traffic between your browser, SOCIA
          and the platform APIs is encrypted with HTTPS/TLS.
        </li>
        <li>
          <b>Encryption at rest</b>: data, including access and refresh tokens,
          is stored in a managed PostgreSQL database (Supabase) that encrypts
          data at rest.
        </li>
        <li>
          <b>Access controls</b>: every record is scoped to your account with
          database row-level security, so no user can read another user&apos;s
          data. OAuth tokens are held server-side only and are never sent to the
          browser. Access to production systems is limited to authorized
          personnel for operating and supporting the service.
        </li>
        <li>
          <b>Least privilege</b>: we request read-only permissions wherever a
          feature allows it, and request a write permission only for an action
          you explicitly take, such as publishing a post you scheduled.
        </li>
        <li>
          <b>Retention and deletion</b>: disconnecting an account deletes its
          stored tokens and synced data, as described below.
        </li>
      </ul>

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

      <h2>Google user data and Limited Use</h2>
      <p>
        SOCIA&apos;s use and transfer of information received from Google APIs
        to any other app will adhere to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Specifically, data obtained
        from your connected YouTube channel is used only to provide and improve
        the analytics and recommendations you see in SOCIA. We do not sell it,
        we do not use it for advertising, and we do not use it to develop,
        improve or train generalized AI or machine-learning models. We do not
        transfer it to others except as needed to provide these user-facing
        features, to comply with applicable law, or as part of a merger or
        acquisition, and humans do not read it except with your consent, for
        security purposes such as investigating abuse, or to comply with the
        law.
      </p>

      <h2>Third-party platforms</h2>
      <p>
        Your use of Instagram, Facebook and YouTube through SOCIA is also
        governed by those platforms&apos; own terms and privacy policies. SOCIA
        accesses them only through their official APIs, and only with the
        permissions you grant on each platform&apos;s consent screen &mdash;
        Meta&apos;s for Instagram and Facebook, Google&apos;s for YouTube.
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

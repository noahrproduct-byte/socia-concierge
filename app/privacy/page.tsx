import Link from "next/link";

export const metadata = { title: "Privacy Policy — SOCIA" };

// Required by TikTok, Meta and Google app review, and owed to users regardless.
// Plain-language on purpose: it describes what the app actually does today,
// checked against the code. Update the date whenever the substance changes.
export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <h1>Privacy Policy</h1>
      <p className="legal-date">Last updated: October 15, 2026</p>

      <p>
        SOCIA (sociaos.com) is an AI social media strategist operated by SOCIA
        LLC, a Tennessee company. This policy describes what information SOCIA
        collects, why, who helps us process it, how long we keep it, and the
        choices you have. It is written to be read, not skimmed past.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <b>Account information</b>: your email address and password (stored
          hashed), or, if you sign in with Google, the name, email address and
          profile picture Google shares. We also keep your plan and, if you
          pay, your billing status (see Payments below).
        </li>
        <li>
          <b>Instagram</b>: when you connect an Instagram professional account,
          Meta gives us an access token and, with the permissions you approve
          (<code>instagram_business_basic</code>,{" "}
          <code>instagram_business_manage_insights</code>,{" "}
          <code>instagram_business_content_publish</code>,{" "}
          <code>instagram_business_manage_comments</code>), we read your
          profile, follower counts, your posts and their metrics and insights,
          and the comments on your posts. This includes collab posts you joined
          as a collaborator, with the posting account&apos;s username and the
          post&apos;s totals. We publish only posts you schedule and reply to a
          comment only when you approve the reply.
        </li>
        <li>
          <b>Facebook Pages</b>: when you connect a Facebook Page, Meta gives us
          access tokens and, with the permissions you approve
          (<code>pages_show_list</code>, <code>pages_read_engagement</code>,{" "}
          <code>pages_read_user_content</code>, <code>pages_manage_posts</code>,{" "}
          <code>pages_manage_engagement</code>, <code>read_insights</code>,{" "}
          <code>instagram_basic</code>, <code>business_management</code>), we
          read the Page&apos;s details, posts, engagement, insights and comments.
          We publish and reply only when you do.
        </li>
        <li>
          <b>YouTube</b>: when you connect your channel, Google gives us OAuth
          tokens and we read, with read-only permissions
          (<code>youtube.readonly</code>, <code>yt-analytics.readonly</code>),
          your channel details, your videos and your own YouTube analytics
          (views, watch time, subscriber changes and the age breakdown of your
          viewers), solely to show them back to you in SOCIA and base
          recommendations on them. Only if you turn on YouTube publishing do we
          ask for the <code>youtube</code> permission, and we use it only to
          upload a video you schedule, set its details and add it to a playlist
          you choose.
        </li>
        <li>
          <b>TikTok</b>: when you connect a TikTok account, TikTok gives us
          access tokens and, with the permissions you approve
          (<code>user.info.basic</code>, <code>user.info.profile</code>,{" "}
          <code>user.info.stats</code>, <code>video.list</code>,{" "}
          <code>video.upload</code>), we read your profile, follower and video
          counts, and your public videos and their counts, and send a video you
          schedule to your TikTok account. If TikTok approves direct posting,
          we also ask for <code>video.publish</code> to post a video you
          schedule.
        </li>
        <li>
          <b>Other accounts&apos; public information</b>: when you track
          competitors or explore your niche, SOCIA reads public profile and post
          information about other accounts through the platforms&apos; APIs and
          public web research, to compare it with yours.
        </li>
        <li>
          <b>Comments on your posts</b>: for AI comment replies, we store the
          commenter&apos;s name or username, the comment and the post&apos;s
          caption, alongside the reply SOCIA suggests. Nothing is sent until you
          approve it.
        </li>
        <li>
          <b>Content you create or upload</b>: captions, drafts, notes, and the
          images and videos you schedule. In Content Studio, a video you
          analyze is read in your browser, which sends sampled frames for
          analysis; its sound is uploaded briefly for transcription. Clips you
          add to Build from Clips are uploaded to private storage so SOCIA can
          analyze them and you can edit them.
        </li>
        <li>
          <b>Brand and profile details you provide</b>: your niche, goals,
          location and brand settings, used to personalize analysis.
        </li>
        <li>
          <b>Teams and workspaces</b>: the people you invite, their roles, and
          who submitted, approved or published a post.
        </li>
        <li>
          <b>AI assistants you connect</b>: if you connect SOCIA to an AI
          assistant such as Claude or ChatGPT, we keep which assistant you
          connected, when, and a log of its requests (what it asked for, the
          result and the time).
        </li>
        <li>
          <b>Usage records</b>: product events such as viewing the pricing
          page, reaching a plan limit or upgrading, and how much AI processing
          each feature used, so we can set fair plan limits. Our hosting keeps
          server logs for operating and debugging the service.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To analyze your accounts and generate scores, plans, captions, reply suggestions, alerts and summaries.</li>
        <li>To publish what you schedule, at the time you schedule it, and to reply to comments when you approve a reply.</li>
        <li>To run teams, workspaces, approvals and billing.</li>
        <li>To operate, secure, debug and improve the product, and to prevent abuse.</li>
      </ul>
      <p>
        We do not sell your data, we do not share it for advertising, and we
        do not use it to advertise to you.
      </p>

      <h2>Who processes it for us</h2>
      <p>
        We share data only with the services that run SOCIA, and only what each
        needs:
      </p>
      <ul>
        <li><b>Supabase</b>: database, sign-in and file storage.</li>
        <li><b>Vercel</b>: hosting and server logs.</li>
        <li>
          <b>Anthropic (Claude)</b>: SOCIA&apos;s analysis and writing. The
          material a feature needs (for example your posts and their metrics,
          captions, brand details, comments, video frames or transcripts) is
          sent to Anthropic to produce the result. Competitor research also uses
          Anthropic&apos;s web search. Under Anthropic&apos;s commercial terms,
          this data is not used to train its models.
        </li>
        <li>
          <b>AssemblyAI</b>: speech-to-text for videos you analyze, caption or
          build from. For a video you analyze or caption, the audio file is
          deleted from our storage as soon as the transcript is back; for Build
          from Clips it is kept with the clip&apos;s footage and deleted with it.
        </li>
        <li>
          <b>Stripe and Link</b>: payments, sales tax and receipts.
        </li>
        <li>
          <b>Google Fonts</b>: Content Studio&apos;s video previews load a font
          from Google Fonts in your browser.
        </li>
        <li>
          <b>The platforms you connect</b> (Meta for Instagram and Facebook,
          Google for YouTube and Google sign-in, TikTok): we exchange data with
          them only as described above.
        </li>
        <li>
          <b>AI assistants you connect</b>: when you connect an assistant, it
          can ask SOCIA for your workspace&apos;s analytics through read-only
          tools, and SOCIA answers it. What the assistant does with that data is
          governed by its own terms. It never receives your platform access
          tokens, and you can disconnect it at any time in Settings, under AI
          Assistants.
        </li>
      </ul>
      <p>
        We may also disclose information when the law requires it, or as part
        of a merger or acquisition, subject to this policy.
      </p>

      <h2>Payments</h2>
      <p>
        Payments are handled by Stripe and Link. Your card details go to them,
        never to SOCIA. We keep your Stripe customer and subscription
        identifiers, your plan, the subscription status and its billing dates.
        Stripe&apos;s and Link&apos;s handling of your payment information is
        covered by their own privacy policies.
      </p>

      <h2>Where it lives</h2>
      <p>
        Data is stored with Supabase (database, sign-in and files) and the app
        is hosted on Vercel. Access tokens for connected platforms are stored
        server-side and never exposed to your browser, other users or AI
        assistants. Media you schedule is stored at an unlisted web address so
        the platform can fetch it when it publishes.
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
          <b>Access controls</b>: every record is scoped to your account and
          workspace with database row-level security, so no user can read
          another user&apos;s data, and team members see only the workspaces
          they were invited to. OAuth tokens are held server-side only and are
          never sent to the browser. Sign-in tokens for AI assistants are stored
          only as hashes. Access to production systems is limited to authorized
          personnel for operating and supporting the service.
        </li>
        <li>
          <b>Least privilege</b>: we request read-only permissions wherever a
          feature allows it, and use a write permission only for an action you
          explicitly take, such as publishing a post you scheduled or sending a
          reply you approved.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your account data, for as long as your account exists.</li>
        <li>
          A connected account&apos;s tokens, synced data and daily history, until
          you disconnect it (see below).
        </li>
        <li>
          Build from Clips footage: 14 days on Free and Starter, 30 days on
          Growth and 60 days on Pro, counted from upload; then it is deleted
          automatically, together with its audio. Audio from a video you
          analyze or caption is deleted as soon as the transcript is back.
        </li>
        <li>Media you schedule, until you delete the post.</li>
        <li>
          AI assistant sign-in tokens expire after an hour (renewal tokens
          after 30 days) and are removed within a week of expiring; the log of
          an assistant&apos;s requests is kept for 180 days.
        </li>
        <li>
          Changing to a smaller plan never deletes your data: anything beyond
          the new plan is paused until you upgrade again or choose what to keep.
        </li>
      </ul>

      <h2>Deleting your data</h2>
      <p>
        Disconnecting a social account in Settings deletes its stored tokens,
        the synced profile and posts, and the daily history SOCIA recorded for
        that account. Removing SOCIA from your Instagram or Facebook settings
        triggers the same deletion automatically through Meta&apos;s deletion
        callback; see <Link href="/data-deletion">Data deletion</Link> for the
        steps and to check a confirmation code. To delete your SOCIA account and
        all associated data, email{" "}
        <a href="mailto:socia.app2026@gmail.com">socia.app2026@gmail.com</a>{" "}
        from the address you signed up with and we will remove it within 30
        days.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>
          You can ask for a copy of your data, or ask us to correct or delete
          it, by emailing{" "}
          <a href="mailto:socia.app2026@gmail.com">socia.app2026@gmail.com</a>.
        </li>
        <li>
          You can disconnect any social account or AI assistant in Settings,
          and revoke SOCIA&apos;s access from the platform itself: for Google
          and YouTube at{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>
          , and in the apps and websites settings of Instagram, Facebook and
          TikTok.
        </li>
        <li>
          SOCIA uses cookies only to keep you signed in and to complete a
          connection with a platform, and your browser&apos;s storage for
          display preferences. There are no advertising or third-party analytics
          cookies.
        </li>
      </ul>

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
        improve or train generalized AI or machine-learning models; when it is
        sent to Anthropic to produce your analysis, Anthropic does not train on
        it. We do not transfer it to others except as needed to provide these
        user-facing features, to comply with applicable law, or as part of a
        merger or acquisition, and humans do not read it except with your
        consent, for security purposes such as investigating abuse, or to comply
        with the law.
      </p>
      <p>
        SOCIA uses YouTube API Services. By connecting a YouTube channel you
        agree to the{" "}
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>
        , and Google&apos;s handling of your data is described in the{" "}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.
      </p>

      <h2>Third-party platforms</h2>
      <p>
        Your use of Instagram, Facebook, YouTube and TikTok through SOCIA is
        also governed by those platforms&apos; own terms and privacy policies.
        SOCIA accesses them only through their official APIs, and only with the
        permissions you grant on each platform&apos;s consent screen.
      </p>

      <h2>Children</h2>
      <p>
        SOCIA is not directed to children under 13, and we do not knowingly
        collect information from them. If you believe a child has given us
        information, email us and we will delete it.
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

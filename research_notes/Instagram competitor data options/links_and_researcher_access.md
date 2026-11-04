# Compliant fallback routes for Instagram competitor research: pasted links (A) and Meta researcher programs (B)

Researched 2026-11-01. Not legal advice. "UNVERIFIED" marks claims I could not confirm in a primary source.

## A1. What Meta oEmbed (instagram_oembed / Meta oEmbed Read) allows with a pasted Instagram URL today

### Takeaway
A pasted public post, Reel or profile URL can be turned into Instagram's official embed HTML, and nothing more. Since 2026-06-15 this works without a token or App Review, at up to 1,000 requests per hour. The response carries no thumbnail, author or caption fields; those were removed on 2025-11-03. Meta's docs forbid storing, extracting or analysing the metadata or content for anything other than showing the embed. So the route covers "save the link and show it" and does not cover "analyze it".

### Cited Findings
- Endpoint: `GET graph.facebook.com/instagram_oembed`. Supported URLs: posts `instagram.com/p/{shortcode}/`, Reels `instagram.com/reel/{shortcode}/`, profiles `instagram.com/{username}`. — [Embed an Instagram Post (Meta docs)](https://developers.facebook.com/docs/instagram-platform/oembed/)
- **2026-06-15 change:** "On June 15, 2026, we lifted the access token requirement from all Meta oEmbed APIs. This means that App Review will no longer be required to embed public Meta content." The notice lists Instagram oEmbed among the covered endpoints. — [oEmbed Post reference](https://developers.facebook.com/docs/graph-api/reference/oembed-post/)
- Rate limits after that change: "With tokenless access, you can make up to 1,000 oEmbed API requests per endpoint every hour". Apps that already have Meta oEmbed Read approved "can still use an access token to make up to 5 million oEmbed API requests per endpoint every day." — [oEmbed Post reference](https://developers.facebook.com/docs/graph-api/reference/oembed-post/)
- Conflict: the Instagram-specific oEmbed pages do not mention the June 2026 tokenless change. One page still says only "You can make up to 1,000 requests every hour". — [Embed an Instagram Post](https://developers.facebook.com/docs/instagram-platform/oembed/); [legacy Instagram oEmbed page](https://developers.facebook.com/docs/instagram/oembed). Older Meta guidance, quoted in search snippets, required "App Review for the oEmbed Read feature" plus an App or Client access token. The newer Graph API notice appears to supersede that.
- The feature page for Meta oEmbed Read (the token route) still says it "requires successful completion of the App Review process" and "is only available with business verification". Allowed usage: "To provide front-end views of public Facebook and Instagram pages, posts, and videos". — [Meta oEmbed Read feature reference](https://developers.facebook.com/docs/features-reference/meta-oembed-read)
- Feature history: on 2025-04-08 Meta introduced "Meta oEmbed Read" to replace "oEmbed Read". "The current oEmbed Read feature will be deprecated on November 3, 2025", and existing apps were migrated automatically. — [Graph API non-versioned changes 2025](https://developers.facebook.com/docs/graph-api/changelog/non-versioned-changes/nvc-2025)
- **Removed fields:** "The author_name, author_url, thumbnail_url, thumbnail_width, and thumbnail_height fields will be removed" from the Facebook post, Facebook video and Instagram post oEmbed responses. "These changes will apply across all API versions on November 3, 2025." — [nvc-2025 changelog](https://developers.facebook.com/docs/graph-api/changelog/non-versioned-changes/nvc-2025); confirmed as "no longer returned" in the [oEmbed Read feature reference](https://developers.facebook.com/docs/features-reference/oembed-read)
- **Current instagram_oembed response fields** (all default): `html` ("The HTML used to display the post"), `provider_name`, `provider_url`, `type`, `version` (always 1.0) and `width`. No title, caption, author, thumbnail, like or view field is listed. — [instagram-oembed Graph API reference](https://developers.facebook.com/docs/graph-api/reference/instagram-oembed/)
- Query parameters: `url` (required), `maxwidth` (320 to 658), `omitscript`, and `hidecaption` ("If set to true, the embed code hides the caption. Defaults to false"). — [instagram-oembed reference](https://developers.facebook.com/docs/graph-api/reference/instagram-oembed/)
- **Usage restriction:** the endpoint "is only meant to be used for embedding Instagram content in websites and apps". Using the metadata or content "(or their derivations) from the endpoint for any purpose other than" that is prohibited. This includes "consuming, manipulating, extracting, or persisting the metadata and content" and "deriving information about pages, posts, and videos from the metadata for analytics purposes." — [Embed an Instagram Post](https://developers.facebook.com/docs/instagram-platform/oembed/); [legacy page](https://developers.facebook.com/docs/instagram/oembed)
- Conflict: the old "oEmbed Read" feature page lists "Analytics insights and marketing or advertising" as allowed if the data is "aggregated and de-identified or anonymized". The replacement "Meta oEmbed Read" page lists only front-end views. The Instagram oEmbed doc bans analytics outright. Treat the stricter Instagram doc as controlling. — [oEmbed Read (deprecated)](https://developers.facebook.com/docs/features-reference/oembed-read); [Meta oEmbed Read](https://developers.facebook.com/docs/features-reference/meta-oembed-read)
- Limitations: "Posts on private, inactive, and age-restricted Instagram accounts are not supported", "Accounts that have disabled Embeds are not supported", "Stories are not supported", "Shadow DOM is not supported". — [Instagram oEmbed docs](https://developers.facebook.com/docs/instagram/oembed)
- Thumbnails: a third-party guide says Meta suggests developers make their own thumbnails from the post page's HTML metadata (secondary source, UNVERIFIED with Meta). Doing that means fetching instagram.com pages, which sits close to the automated-collection ban in the Terms of Use (A3). — [Bluehost blog](https://www.bluehost.com/blog/facebook-oembed-api/)

### Inferences
- What SOCIA can build compliantly: a user pastes a URL. SOCIA stores the URL the user typed (user input, not Platform Data), calls oEmbed, and renders the live embed. The user writes their own notes or tags about why they like it, and those notes feed the weekly plan. "Show it" is covered. "Analyze its creative structure" is not covered from oEmbed data, because there is no caption or thumbnail, and deriving or persisting from the HTML is banned.
- Analysis has to come from what the user supplies: their description, a caption they paste, or their own answers to a short structure checklist (hook, format, length, CTA). The UI must label it that way, per the anti-slop standard: never present it as data SOCIA read from Instagram.
- Do not cache the returned `html` long term. Fetch it at view time, within the 1,000 per hour limit. This is the safest reading of the "persisting" ban.
- If an embed fails (account private, embeds disabled, post deleted), show an honest "this post can't be shown" state with the link. Never show a blank or placeholder metric.

### Gaps
- No Meta doc states the precise "persisting" boundary, for example whether storing the `html` string for 24 hours is allowed.
- The Instagram-specific oEmbed page has not been updated for the June 2026 tokenless change, so whether tokenless calls behave the same for `instagram_oembed` should be tested live.
- I did not find whether profile-URL embeds are still supported after the 2025 changes; the docs still list them.

## A2. Looking up a post by URL or shortcode for an account that is not connected (Business Discovery and others)

### Takeaway
No official endpoint takes a post URL or shortcode and returns data about another account's post. Business Discovery looks up other professional accounts by username only, and only through Instagram API with Facebook Login (or Unified Login). With Instagram Login only, which is SOCIA's setup, nothing official exists beyond oEmbed.

### Cited Findings
- Business Discovery lets you "get basic metadata and metrics about other Instagram professional accounts". It is listed for the Instagram API with Facebook Login and the Instagram API with Unified Login. Instagram Login is not mentioned. — [Business Discovery docs](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery)
- Queries target an account by username. "performing a GET on any returned IG Media will fail due to insufficient permissions". There is no lookup by media ID or shortcode. — [Business Discovery docs](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery)
- Sample responses show `like_count`, `comments_count` and `view_count` on another account's media. `media_url` can be left out for some videos with copyrighted or licensed audio, and for Reels whose owners turned off downloads. "Data about age-gated Instagram professional accounts will not be returned." — [Business Discovery docs](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery)
- Instagram Creator Marketplace API: GA for Instagram on 2025-10-01. It helps brands "discover and evaluate creators" for partnership ads. It needs `instagram_creator_marketplace_discovery` plus `instagram_basic`, advanced access through App Review, Facebook Login by an eligible brand, and the brand must be eligible for Creator Marketplace. — [Meta developer blog, 2025-09-09 (updated)](https://developers.facebook.com/blog/post/2025/09/09/instagrams-creator-marketplace-and-facebook-creator-discovery-apis-are-launching-soon-get-ready/); [Creator Marketplace API docs](https://developers.secure.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/creator-marketplace)

### Inferences
- With Facebook Login (for the few SOCIA users who have a linked Page), SOCIA could take the username from a pasted URL, call Business Discovery for that account's recent media, and match the pasted permalink. That would give like, comment and view counts for that post if it is recent enough to be returned. This only works if the pasted account is a professional (Business or Creator) account that is not age-gated. The "permalink" field is not confirmed in the page text I read (UNVERIFIED).
- Without Facebook Login, nothing exists. SOCIA must not show any likes or views for a pasted post, and must not show zeros. Say "Instagram doesn't share numbers for other accounts' posts".
- Creator Marketplace is for brand-creator partnership discovery and is gated to eligible brands. It is not a general trend or competitor feed, and it does not fit SOCIA's Instagram Login users.

### Gaps
- I did not read the Business Discovery endpoint reference for exact permissions (instagram_basic, instagram_manage_insights, pages_read_engagement) or how far back media goes; the page defers to the reference.

## A3. What the Instagram embed shows, and the terms for embeds in a commercial app

### Takeaway
The embed is Instagram's own rendering. It can include the caption, which `hidecaption` can hide. Whether it shows like or view counts is not documented and is UNVERIFIED. Meta does not grant a copyright sublicense through embeds. Instagram said in 2020 that third parties need their own rights from the rights holder, and courts have split on the question.

### Cited Findings
- The embed's height "will vary depending on the container width and the length of the caption", so captions show by default. — [Instagram oEmbed docs](https://developers.facebook.com/docs/instagram/oembed); `hidecaption` parameter — [instagram-oembed reference](https://developers.facebook.com/docs/graph-api/reference/instagram-oembed/)
- Like or view counts in the embed: not documented in Meta docs (UNVERIFIED; check by rendering an embed).
- In 2020 Instagram told press: "While our terms allow us to grant a sub-license, we do not grant one for our embeds API", and said its platform policies require third parties to have the necessary rights from rights holders. — [Engadget](https://www.engadget.com/instagram-embed-feature-statement-202123688.html); [Copyright Lately](https://copyrightlately.com/legal-embed-instagram-photos-website/)
- Sinclair v. Mashable (S.D.N.Y. 2020): the court first held that Instagram's terms licensed embedding, then on reconsideration found the terms "insufficiently clear" to dismiss at the pleading stage. — [Eric Goldman blog](https://blog.ericgoldman.org/?p=21039); [Mondaq](https://webiis08.mondaq.com/unitedstates/copyright/959278/sdny-reconsiders-instagram-embedding-by-mashable)
- Commentators note that embedding Instagram posts in purely commercial advertising is riskier than editorial use. — [Frankfurt Kurnit advertising law blog](https://advertisinglaw.fkks.com/post/102g8ym/instagram-and-embedding-photos-an-update-and-a-bombshell-from-instagram)
- Meta Platform Terms (secondary to the oEmbed doc): bans processing Platform Data "for purposes other than the applicable permitted purposes set forth in Meta's Developer Docs" (§3.a.viii), "to build or augment user profiles" without consent (§3.a.v), surveillance tools (§3.a.iii), and "Selling, licensing, or purchasing Platform Data" (§3.a.iv). Data must be deleted when "no longer necessary for a legitimate business purpose" (§3.d). — [Meta Platform Terms](https://developers.facebook.com/terms/)
- Instagram Terms of Use bar "collecting information in an automated way without our express permission". — [Instagram Terms of Use](https://help.instagram.com/581066165581870) (the live page didn't render for me; wording confirmed through copies such as a [court exhibit](https://www.lb7.uscourts.gov/documents/19-1861URL1Termsofuse.pdf))

### Inferences
- A private, per-user saved embed inside SOCIA, used for the user's own inspiration, is close to the "front-end view" Meta intends, and is lower risk than putting someone's post in marketing. Still: never use competitor embeds in SOCIA's public site, ads or promo videos, and never re-host the media.
- Respect removals: if a post is deleted or embeds are disabled, the embed breaks by design. SOCIA should not keep a copy.

### Gaps
- I couldn't load the current Instagram Terms of Use page (help center rendered empty), so I couldn't get its last-revised date or full IP clauses.
- I found no current (2025 to 2026) Meta statement on embed licensing that replaces the 2020 one.

## A4. A user records or uploads a competitor's Reel for analysis (copyright and terms, high level; NEEDS LEGAL REVIEW)

### Takeaway
Analysing a video to describe its structure (hook, pacing, shot types) and writing an original idea is the kind of transformative "comment, research" purpose fair use favours. Storing full copies, re-hosting, showing them to others, or using them in generated output is weaker. Fair use is decided case by case, and commercial purpose weighs against it. Getting the file by downloading from Instagram can separately breach Instagram's terms. Needs legal review before launch.

### Cited Findings
- The four statutory factors are: "Purpose and character of the use, including whether the use is of a commercial nature"; "Nature of the copyrighted work"; "Amount and substantiality of the portion used"; "Effect of the use upon the potential market". — [U.S. Copyright Office Fair Use Index](https://www.copyright.gov/fair-use/)
- Favoured purposes include "criticism, comment, news reporting, teaching, scholarship, and research". Transformative uses that "add something new, with a further purpose or different character" are more likely fair. "Courts evaluate fair use claims on a case-by-case basis." — [U.S. Copyright Office](https://www.copyright.gov/fair-use/)
- Instagram Terms of Use bar automated collection without "express permission". — [Instagram Terms of Use](https://help.instagram.com/581066165581870)
- `media_url` is withheld for Reels whose owners turned off downloads, and for some licensed audio. That signals Meta treats download as an owner-controlled right. — [Business Discovery docs](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery)

### Inferences
- Lower-risk design: the user uploads a file they hold, SOCIA processes it transiently (extracts structure notes or a transcript), deletes the video, and keeps only SOCIA's own structural description plus the URL. No playback to other workspace members, no reuse of footage or audio in generated videos, and an upload attestation ("I have the right to use this file for analysis"). Also add a DMCA takedown path.
- Higher risk: keeping libraries of competitor videos, sharing them across a team or workspace, or feeding them into Remotion builds as source footage.
- Licensed music in Reels is an extra rights layer. Strip or ignore the audio in analysis outputs.
- Internal flag: the memory notes for rater training mention an "embed-page trick to fetch a Reel". If that fetches video files from Instagram's embed page, it likely conflicts with the oEmbed "extracting/persisting" ban and the automated-collection clause. It should not become a product feature. Legal review needed.

### Gaps
- No case law found on AI analysis of short-form video for creative-structure extraction. Jurisdictions outside the US (EU text-and-data-mining exceptions, UK) were not researched.

## B1. Meta Content Library and Content Library API

### Takeaway
Meta Content Library is open only to people at not-for-profit academic or research institutions, with public-interest research as a core purpose. A commercial SaaS like SOCIA, or its small-business customers, does not qualify. It covers public Instagram posts and Reels with metrics such as views. API analysis happens only inside cleanrooms (Meta Secure Research Environment or the SOMAR Virtual Data Enclave). In 2026 applications moved to Meta's Research Tools Manager, with independent review by CASD rather than ICPSR.

### Cited Findings
- Eligibility: academic institutions must be "A not-for-profit institution (in other words, not a business whose sole purpose is to make a profit)". Non-academic organisations must be not-for-profit with scientific or public-interest research as their primary purpose. Journalists are not mentioned. — [Content Library: Get access](https://developers.facebook.com/docs/content-library-and-api/get-access); [Transparency Center: Meta Content Library](https://transparency.meta.com/researchtools/meta-content-library) (last updated 2026-04-30)
- Process: apply through "Meta Research Tools Manager", "a new Meta-hosted application portal". CASD "independently reviews applications". The timeline is 2 to 3 weeks for CASD review plus 2 to 3 weeks of Meta processing. Collaborators are reviewed only after the lead researcher is approved. — [Get access](https://developers.facebook.com/docs/content-library-and-api/get-access)
- History: ICPSR (University of Michigan) earlier processed and reviewed all applications ("All applications are processed and reviewed by ICPSR"). SOMAR's Winter 2026 newsletter announced a "Meta Content Library Application Update" moving applications to Meta's portal. — [Meta letter to Sen. Coons](https://www.coons.senate.gov/imo/media/doc/letter_from_meta.pdf); [SOMAR Winter 2026 newsletter](https://www.icpsr.umich.edu/sites/somar/somar-newsletter-archive/somar-newsletter-winter-2026); [CASD project with Meta](https://www.casd.eu/en/nouveau-projet-avec-meta/)
- Instagram coverage: public posts from business and creator accounts, and from personal accounts that are verified or have 100 or more followers. Includes "photos, videos and reels". Metrics include "number of reactions, shares, views and more", varying by content type. Downloadable data is limited to accounts that are verified or have 25,000 or more followers. — [Transparency Center](https://transparency.meta.com/researchtools/meta-content-library)
- Environment: API data "can be analyzed in a cleanroom environment", either the Meta Secure Research Environment or the SOMAR Virtual Data Enclave. "There are no fees associated with access or computation" on Meta's environment. Researchers may publish results "without prior approval from Meta", with attribution. A substantially changed research programme needs a new application. — [Transparency Center](https://transparency.meta.com/researchtools/meta-content-library)
- Sanctioned jurisdictions are excluded, and some countries' public content is not available. — [Transparency Center](https://transparency.meta.com/researchtools/meta-content-library)

### Inferences
- SOCIA cannot use this route: it is a for-profit business, and its use (competitor insights for paying customers) is commercial, not public-interest research. Cleanroom-only analysis also means data could not flow into a product even if access were granted.
- Even a university partner using MCL could not legally feed SOCIA's product. At most, published aggregate research findings (for example, papers on Reel formats) could be cited as general guidance with attribution.

### Gaps
- The Meta Research Tools Terms and Conditions were not read; the explicit commercial-use prohibition text is therefore UNVERIFIED (it is implied by the not-for-profit eligibility rule).
- Whether journalists qualify under the 2026 rules: not stated in either page I read (UNVERIFIED).

## B2. Other Meta programs for commercial trend data, and whether they have an API

### Takeaway
I found no official Meta API for Instagram trends (trending audio, hashtags or Reels). The Professional Dashboard's Reels Trends is an in-app, mobile-only feature for professional accounts. The Instagram Creator Marketplace API (GA 2025-10-01) is the only commercial "discovery" API, and it is gated to eligible brands for partnership ads through Facebook Login.

### Cited Findings
- Reels Trends in the Professional Dashboard is "Available only on the Instagram mobile app and through professional accounts". Access is through the Professional Dashboard, then Reels Trends, then the Audio or Hashtags tab. — [IZEA](https://izea.com/?p=317064) (secondary source)
- Creator Marketplace API: GA 2025-10-01, for discovering creators for partnership ads. It needs the `instagram_creator_marketplace_discovery` permission, advanced access through App Review, and an eligible brand. — [Meta developer blog](https://developers.facebook.com/blog/post/2025/09/09/instagrams-creator-marketplace-and-facebook-creator-discovery-apis-are-launching-soon-get-ready/); [docs](https://developers.secure.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/creator-marketplace)
- Vendor sites that sell Instagram "trending music" APIs (for example SocialCrawl) appear to be scraping-based and are not Meta programs. — [SocialCrawl](https://www.socialcrawl.dev/platforms/instagram/music-trending); [DEV Community](https://dev.to/agenthustler/instagram-data-api-in-2026-what-developers-use-when-the-official-api-wont-work-4e0)

### Inferences
- The compliant way to use Reels Trends in SOCIA is to point users to it ("Open Professional Dashboard, then Reels Trends, on your phone") and let them paste what they found. SOCIA should not claim it has trend data.
- Published Meta or Instagram trend reports (for example the annual Instagram trend report) could be cited as dated editorial content. I didn't verify a 2026 edition (UNVERIFIED).

### Gaps
- I found no Meta primary-source page for Professional Dashboard Reels Trends, and no Instagram trend-report API.
- Meta's Marketing API or Ads Library may offer ad-creative research for Facebook and Instagram ads. That is outside this scope and was not researched.

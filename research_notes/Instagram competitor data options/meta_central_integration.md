# Centralized, company-owned Meta integration for Instagram competitor and trend data (SOCIA)

Research date: 2026-11-01. Not legal advice. Primary sources are Meta's developer pages, read on 2026-11-01. Platform Terms and Developer Policies both say "last updated February 3, 2026".

**About the quotes.** I read the pages with a fetch tool that shortens long quotes. Text in quotation marks is Meta's wording as that tool returned it. Text without quotation marks is a paraphrase. Check the exact wording on the live page before any of it goes into a contract, an App Review answer or a lawyer memo.

**The design being tested.** SOCIA owns one Instagram professional account linked to a Facebook Page. It connects that account with Facebook Login and calls `business_discovery` and Hashtag Search with the account's token. The results go into one research database, and every customer can see it.

## 1. Platform Terms and Developer Policies: processing, sharing, selling, databases, retention

### Takeaway
No clause in the Terms names "a central competitor database shared across customers", so nothing bans it word for word. Several clauses still cut against it:
- Data may be processed only for the permitted purposes in Meta's Developer Docs (3.a.viii).
- Selling or licensing Platform Data is banned (3.a.iv).
- Building or adding to profiles without valid User consent is banned (3.a.v).
- Sharing is limited to a closed list of cases (3.c).
- Data must be deleted when no longer needed (3.d).
- A Tech Provider must keep each Client's data separate (5.b.ii.2).

Read together, these make a shared, monetized pool of Business Discovery data a high-risk design. A lawyer should review it, and it is worth asking Meta directly through a Developer Support ticket.

### Cited findings
- **Scope of "Platform Data".** It is defined as "any information, data, or other content you obtain from us, through Platform or through your App." It includes data "anonymized, aggregated, or derived from such data" (§12, §12.l). So Business Discovery and Hashtag Search results are Platform Data, and so are aggregates made from them. — [Meta Platform Terms](https://developers.facebook.com/terms)
- **Who a "User" is.** A User is "the end user of an App (whether a person or an entity)." A "Client" is "the User of a Tech Provider's App." A "Tech Provider" is a developer whose "primary purpose is to enable Users thereof to access and use Platform or Platform Data." — [Platform Terms §12](https://developers.facebook.com/terms)
- **Prohibited practices (§3.a).** The section opens: "You will not perform, or facilitate or support others in performing, any of the following prohibited practices". Items that apply here:
  - (iv) "Selling, licensing, or purchasing Platform Data."
  - (v) "Processing Platform Data without valid User consent in order to build or augment user profiles for any purpose."
  - (vii) Materially changing the app's core functionality or data processing without going back through App Review (paraphrase).
  - (viii) "Processing Platform Data for purposes other than the applicable permitted purposes set forth in Meta's Developer Docs."

  — [Platform Terms §3.a](https://developers.facebook.com/terms)
- **Sharing (§3.c).** "You may only share Platform Data in compliance with these Terms." For data not collected as a Tech Provider, sharing is allowed only in these cases:
  1. When law requires it.
  2. With a Service Provider.
  3. "when a User expressly directs you to share or expressly consents to your sharing the data with the third party".
  4. "solely with respect to Platform Data that is not Restricted Platform Data, with other third parties, so long as:" you contractually prohibit misuse, keep proof, and make sure the recipients comply. You stay "responsible for their acts and omissions, including their noncompliance."

  — [Platform Terms §3.c.ii](https://developers.facebook.com/terms)
- **Restricted Platform Data.** It includes Platform Data that "(i) reasonably can be used to identify a particular User or device," plus data from certain listed permissions and data Meta designates as restricted. — [Platform Terms §12](https://developers.facebook.com/terms)
- **Restricted data must be necessary.** "You will not request Restricted Platform Data unless it is necessary to meaningfully improve the quality" of the User's experience (§3.b.i). — [Platform Terms](https://developers.facebook.com/terms)
- **Tech Providers (§5.b.ii).**
  - "You will only use Platform and Process Platform Data on behalf of and at the direction of your Client" (§5.b.ii.1).
  - Each Client's Platform Data must be "maintained separately from that of other Clients" (§5.b.ii.2).
  - Tech Providers may share data with Clients only after contractually prohibiting the Clients from violating the Terms (§5.b.ii.4.a).

  — [Platform Terms §5.b](https://developers.facebook.com/terms)
- **Service Providers.** They may use Platform Data "solely for you and at your direction in order to provide services you requested" (§5.a.i.1). — [Platform Terms](https://developers.facebook.com/terms)
- **Retention and deletion (§3.d).** Unless law requires keeping it, you must:
  - "Update or delete Platform Data promptly after receiving a request from us or the User to do so."
  - Delete it when keeping it "is no longer necessary for a legitimate business purpose."
  - Delete it "When you stop operating the product or service through which the Platform Data was acquired."
  - Delete it when a User asks. Data that has been "aggregated, obscured, or de-identified" is the exception to this last duty.

  — [Platform Terms §3.d.i](https://developers.facebook.com/terms)
- **Caching.** The fetched Platform Terms text has no separate caching clause. The §3.d deletion duties and the Developer Docs purposes are what govern how long data is kept. — [Platform Terms](https://developers.facebook.com/terms)
- **Privacy policy.** You may process Platform Data only as your privacy policy describes (§4.c). The policy must explain what you process, why, and how Users can ask for deletion (§4.b). — [Platform Terms §4](https://developers.facebook.com/terms)
- **Circumvention.** Meta may take enforcement action if "You have created or maintained App(s) to circumvent, or attempt to circumvent, our enforcement actions," including creating Apps to bypass restrictions placed on other Apps or accounts (§7.e.i.3). — [Platform Terms](https://developers.facebook.com/terms)
- **Developer Policies, Instagram section (§6).**
  - 6.1: "Comply with any requirements or restrictions imposed on usage of Instagram user photos and videos". It adds: "You are solely responsible for making use of User Content in compliance with owners' requirements or restrictions."
  - 6.2: "Don't use the Instagram Platform to simply display User Content, import or backup content, or manage Instagram relationships" ... "without our prior permission."

  — [Meta Developer Policies](https://developers.facebook.com/devpolicy)
- **Developer Policies, general.**
  - §2.2: "Respect the way Meta Products look and function, and the limits we've placed on product functionality."
  - §1.1: "Develop and manage your App with an authentic account."
  - §10.7(e), in the advertising section: "Don't use Meta's data to build or augment any user profiles."

  — [Meta Developer Policies](https://developers.facebook.com/devpolicy)

### Inferences (interpretation, not Meta's words)
- **Showing the data to customers is sharing.** In this design, the token that collected the data belongs to SOCIA, not to the customer looking at it. So putting competitor data in front of customers is "sharing Platform Data" with third parties under §3.c, not processing it for the User who provided it. The only path that fits is §3.c.ii.4: the data must not be Restricted Platform Data, and every customer must be bound by contract.
- **Is it Restricted Platform Data? Ask a lawyer.** Competitor accounts are not "Users" of SOCIA's app, so the clause "identify a particular User" may not apply to them literally. Meta can still designate data as restricted. Business Discovery returns identifiable business accounts (username, posts), and some Creator accounts are individual people.
- **A paid shared database may count as "licensing".** Charging subscriptions for access to one central database of Business Discovery and Hashtag data could be read as "licensing" Platform Data (§3.a.iv). It is clearly riskier than processing data for a customer's own connected account. Ask a lawyer.
- **Snapshots over time may count as profiles.** Storing follower counts and posts for the same accounts over time is plausibly "build or augment user profiles" (§3.a.v). The competitor gave no consent to SOCIA. Ask a lawyer.
- **If SOCIA is a Tech Provider, the shared pool conflicts directly.** Meta may classify SOCIA as a Tech Provider, since it is a SaaS whose purpose is letting customers use Platform data. In that case, §5.b.ii.2 (keep each Client's data separate) conflicts with a pool shared across customers. Data collected for one customer's research should not be served to another.
- **Retention.** A permanent historical archive needs a documented "legitimate business purpose" (§3.d.i.2.a) and a deletion path. Deleting the research account, or shutting the feature down, triggers deletion (§3.d.i.2.b).
- **Pure display needs permission.** Developer Policy 6.2 means a feature that just shows competitors' posts, with no analysis or added function, needs Meta's "prior permission".

### Gaps
- I found no Meta statement, FAQ or enforcement post that addresses a SaaS pooling Business Discovery results across customers, either to allow it or to ban it.
- I did not confirm whether Meta treats `business_discovery` results as Restricted Platform Data.
- I could not retrieve the full Developer Docs "permitted purposes" for Business Discovery data beyond the permission text in section 2 below.

## 2. App Review and allowed use cases (Standard vs Advanced Access, permission text)

### Takeaway
Standard Access, with no App Review, is meant for an app that "only serves your Instagram professional account or an account you manage" and for "people who have roles on" the app. SOCIA's design pulls data with its own account, but it serves that data to customers who have no role on the app. That is close to the case Meta says needs Advanced Access: serving people without roles, or accounts you don't own or manage. Even ignoring that, the permissions' allowed-usage text is about managing your own account or Page.

Hashtag Search also needs the Instagram Public Content Access feature, which "requires successful completion of the App Review process before your app can access live data." So a quiet, review-free central integration is not available for hashtags. For Business Discovery it is at best a gray area.

### Cited findings
- **Standard Access.** It is "intended for apps that will only be used by people who have roles on them, during app development, or for testing your app." Meta adds that if your app "only serves your Instagram professional account or an account you manage, Standard Access is all your app needs." — [Instagram Platform overview](https://developers.facebook.com/docs/instagram-platform/overview)
- **Advanced Access.** It is needed when your app serves accounts "that you don't own or manage" or is used by people without a role on your app or its business portfolio (paraphrase). Your app "must complete Meta App Review to be granted Advanced Access"; Business Verification is also required. — [Instagram Platform overview](https://developers.facebook.com/docs/instagram-platform/overview)
- **Access levels in general.**
  - "Permissions with Standard Access can only be requested from app users who have a role on the requesting app."
  - "Permissions with Advanced Access can be requested from any app user."
  - "Advanced Access, however, must be approved on an individual permission and feature basis through the App Review process."

  — [Graph API Access Levels](https://developers.facebook.com/docs/graph-api/overview/access-levels)
- **When App Review applies.** App Review is for apps that need "access to data that you do not own or manage." — [Permissions reference](https://developers.facebook.com/docs/permissions)
- **Business Discovery requirements.**
  - The endpoint is "Available for the Instagram API with Facebook Login."
  - It needs `instagram_basic`, `instagram_manage_insights` and `pages_read_engagement`. It also needs `ads_management` or `ads_read` when the Page role came through Business Manager.
  - Age-gated accounts are not returned.
  - `media_url` is left out for some reels and videos (copyrighted audio, or downloads turned off).

  — [IG User business_discovery reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery)
- **Business Discovery guide.**
  - Purpose: "get basic metadata and metrics about other Instagram professional accounts."
  - "business discovery queries are performed on the app user's Instagram professional account ID."
  - It is available with "Instagram API with Facebook Login" and "Instagram API with Unified Login."
  - "view_count includes both paid and organic metrics."
  - "performing a GET on any returned IG Media will fail due to insufficient permissions."

  — [Business Discovery guide](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery)
- **Permission text** — [Permissions reference](https://developers.facebook.com/docs/permissions):
  - `instagram_basic` allows your app "to read an Instagram account profile's info and media." Allowed usage: "Get basic metadata of an Instagram Business account profile, for example username and ID."
  - `instagram_manage_insights` allows access "to insights for the Instagram account linked to a Facebook Page." The app "can also discover and read the profile info and media of other business profiles." Allowed usage: "get metadata, data insights and story insights of an Instagram Business account."
  - `pages_read_engagement` allowed usage: "The allowed usage for this permission is to help a Page Admin administer and manage a Page."
- **Instagram Public Content Access feature** — [Feature reference](https://developers.facebook.com/docs/features-reference/instagram-public-content-access):
  - The feature "allows your app to access Instagram Graph API's Hashtag Search endpoints."
  - Allowed usages: "discover content associated with your hashtag campaigns," "understand public sentiment around your brand or identify contest, competition and sweepstakes entrants," "provide customer support and better understand and manage your audience." Also "request analytics insights to improve your app and for marketing or advertising purposes, through the use of aggregated and de-identified or anonymized information (provided such data cannot be re-identified)."
  - The bulleted list includes: "Understand and manage their audience, develop their content strategy and obtain digital rights."
  - Requirements: "This permission or feature requires successful completion of the App Review process before your app can access live data." "This permission or feature is only available with business verification." "You may also need to sign additional contracts before your app can access data."
- **Hashtag Search endpoints.**
  - Hashtag search needs the Instagram Public Content Access feature plus `instagram_basic`. The token must belong to a user "approved for tasks on the connected Facebook Page." — [ig-hashtag-search reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag-search)
  - The IG Hashtag object is "Only available for Facebook Login for Business." — [IG Hashtag reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag)
- **Login types** — [Instagram Platform overview](https://developers.facebook.com/docs/instagram-platform/overview):
  - Instagram Login lists Hashtag Search as "Not supported."
  - Facebook Login supports it, and the Page is "Required."
  - A third option, **Unified Login**, is described as recommended for new integrations. Users connect "by logging in with either Instagram or Facebook, without a Facebook Page," and it supports Hashtag Search.
- **Facebook Login for Business setup.** No source I read named a "My app is only for a business I own or manage" option, so the exact wording is UNVERIFIED. The idea it describes matches Meta's statement that Standard Access is enough for an app serving only accounts you own or manage. A 2020 Meta blog describes Standard Access as covering data owned by the developer's business or by people with a role on the app. — [Meta for Developers blog, 2020](https://developers.facebook.com/blog/post/2020/08/04/app-review-improvements-business-developers/)

### Inferences (interpretation)
- **Standard Access is defined by who the app serves, not whose token is used.** Calling Business Discovery with only SOCIA's own account token is technically possible under Standard Access. But the stated test for Standard Access is who the app serves ("only serves your Instagram professional account or an account you manage"; "only be used by people who have roles"). Feeding the results to paying customers without roles plausibly takes the use outside Standard Access. Ask Meta or a lawyer.
- **The allowed-usage text doesn't describe a third-party research database.** The text is about managing your own account and Page ("help a Page Admin administer and manage a Page"). Showing one company's research results to many customers does not fit naturally. `instagram_manage_insights` does openly mention discovering "other business profiles", which supports competitor lookups as a function. It does not say on whose behalf.
- **Hashtag allowed usage is centred on your own brand.** "your hashtag campaigns", "public sentiment around your brand", "manage their audience, develop their content strategy". A trend feed for customers' content strategy is arguably close to "develop their content strategy". That reads most naturally as the app user's own strategy using their own token. App Review is needed either way.
- **Unified Login may be the compliant route.** It is worth checking right away. If Unified Login supports Business Discovery and Hashtag Search for accounts with no Facebook Page, each customer's own connection could make the calls. Each customer's research would then be "on behalf of" that customer, which fits the Terms and the App Review descriptions. It would also spread rate limits per customer. UNVERIFIED in detail: confirm the permission and feature names under Unified Login, and whether an existing Instagram Login app can switch over.

### Gaps
- I did not find the exact App Review instructions or rejection examples for Business Discovery with only the developer's own account.
- I did not confirm whether Instagram Public Content Access can be used in Standard Access mode by an app-role account before App Review. The feature page says App Review is needed "before your app can access live data."

## 3. Rate limits and scale (2,000 or 20,000 lookups per month; multiple research accounts)

### Takeaway
Business Discovery and Hashtag Search are not under the impressions-based Instagram Business Use Case formula. Meta says they "are subject to Platform Rate Limits" (200 calls per hour times the number of daily active users, app-wide, plus a per-user-token hourly count whose number Meta doesn't publish).

Raw call volume probably fits:
- 2,000 lookups a month is about 67 a day.
- 20,000 a month is about 667 a day, or about 28 an hour.

Hashtag Search is the hard limit: 30 unique hashtags per 7 days. That is far too small for a trend database across many customer niches.

Using several research accounts to multiply limits has no explicit permission anywhere. It risks running into the "authentic account", "respect ... limits" and circumvention clauses.

### Cited findings
- **Which limits apply.**
  - "Business Discovery and Hashtag Search API are subject to Platform Rate Limits."
  - Other Instagram endpoints use the Business Use Case formula "Calls within 24 hours = 4800 * Number of Impressions."

  — [Graph API rate limiting](https://developers.facebook.com/docs/graph-api/overview/rate-limiting); [Instagram Platform overview](https://developers.facebook.com/docs/instagram-platform/overview)
- **Platform Rate Limits** — [Graph API rate limiting](https://developers.facebook.com/docs/graph-api/overview/rate-limiting):
  - "Calls within one hour = 200 * Number of Users"
  - "The Number of Users is based on the number of unique daily active users an app has."
  - Example: "if your app has 100 Users, your app can make 20,000 calls per hour."
  - "Graph API requests made with a user access token are counted against that user's call count." "A user's call count is the number of calls a user can make during a rolling one hour window." The page does not publish the per-user number.
  - Responses carry an `X-App-Usage` header.
- **Hashtag cap.** "You can query a maximum of 30 unique hashtags within a 7 day period." Meta does not say outright whether this is per IG account or per app. The reference links to the IG User `recently_searched_hashtags` edge, which suggests per account. UNVERIFIED. — [ig-hashtag-search reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag-search)
- **Hashtag data limits** — [IG Hashtag recent_media](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag/recent-media):
  - `recent_media` "Only returns media objects published within 24 hours of query execution."
  - It returns at most 50 results per page.
  - "You cannot request the `username` field on returned media objects."
  - It "Will not return promoted/boosted/ads media."
  - Available fields: caption, children, comments_count, id, like_count, media_type, media_url, permalink, timestamp.
- **Sensitive hashtags.** The API returns "a generic error" for hashtags Meta deems sensitive or offensive. — [ig-hashtag-search reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag-search)
- **Limits clauses.** "Respect ... the limits we've placed on product functionality" (Developer Policies §2.2) and "Develop and manage your App with an authentic account" (§1.1). — [Developer Policies](https://developers.facebook.com/devpolicy)
- **Circumvention clause.** Enforcement can follow from creating Apps "to circumvent, or attempt to circumvent, our enforcement actions" or to bypass restrictions (§7.e.i.3). — [Platform Terms](https://developers.facebook.com/terms)

### Inferences (interpretation)
- **How many calls a lookup costs.** One `business_discovery` call can return the profile counts and one page of recent media through field expansion (for example `media.limit(N){...}`), so one call is about one lookup. Deeper media history needs extra paginated calls.
- **One account's calls go against one user token.** The app-wide ceiling grows with SOCIA's daily active users. The research token's own hourly count is undisclosed. Developer forums often cite around 200 calls per user per hour; that figure is UNVERIFIED and not stated on the page I read.
- **2,000 a month looks easy.** 20,000 a month (about 28 an hour) probably fits under a 200-an-hour budget per token. The real load depends on refresh frequency: tracking 2,000 accounts daily is about 60,000 calls a month, about 83 an hour. Load-test before committing.
- **Hashtags don't scale.** 30 unique per 7 days is roughly 120 to 130 unique hashtags a month for the whole customer base. Results also cover only the last 24 hours of recent media, or the "top" set. A central trend database can't cover many niches unless it pools many accounts.
- **Several research accounts.** Meta has no text that permits it. Accounts SOCIA genuinely owns and runs are "authentic", but creating them mainly to multiply the hashtag or user-token limits plausibly breaks "respect ... the limits". A lawyer should review, and it is better to ask Meta.

### Gaps
- Meta does not publish the user-level hourly call budget.
- It is not confirmed whether the 30-hashtag limit is per account or per app.
- I found no first-party statement on whether multiple developer-owned research accounts are allowed.

## 4. Meta statements or enforcement against apps that aggregate Business Discovery data for others

### Takeaway
I found no public Meta enforcement action, newsroom post or developer blog that targets an app for pooling or redistributing **Business Discovery API** data. Meta's known enforcement against "Instagram analytics" companies is aimed at **scraping with fake or bot accounts**, not authorized Graph API use. That absence is not evidence the design is allowed: Meta enforces API terms mostly through private actions (restricting access, Data Use Checkup, audits), which don't show up publicly.

### Cited findings
- **Voyager Labs.** Meta sued the analytics and surveillance firm, alleging it used fake accounts to scrape profile data from hundreds of thousands of users. Meta disabled tens of thousands of associated accounts. — [MediaPost](https://www.mediapost.com/publications/article/381546/meta-sues-surveillance-company-that-allegedly-sc.html) (secondary source)
- **Social Data Trading.** Instagram sued this "analytics company", alleging it used thousands of bot accounts to scrape data from September 2020 to September 2021. — [MediaPost](https://www.mediapost.com/publications/article/369624/instagram-sues-analytics-company-social-data-tradi.html); [JURIST, 2021](https://www.jurist.org/news/2021/12/meta-sues-data-analytics-company-over-scraping-of-instagram-accounts) (secondary sources)
- **The OG App.** Meta cracked down on this third-party Instagram client a day after launch. It was built on a reverse-engineered private API. — [Engadget](https://www.engadget.com/meta-cracks-down-on-og-app-instagram-client-005949126.html) (secondary source)
- **Ongoing duties.** The Platform Terms give Meta audit and enforcement rights (§7). Developers must delete data on Meta's request (§3.d.i.1). — [Platform Terms](https://developers.facebook.com/terms)

### Inferences (interpretation)
- **Biggest practical risk: SOCIA's whole app.** The likeliest outcome is not a lawsuit. It is App Review rejection, a later Data Use Checkup or audit question, or access restrictions on SOCIA's single app. That app also carries customers' Instagram Login and publishing, so a strike against the central research feature could hit the core product. Keeping research on the same app ID as core features concentrates the risk.
- **The scraping cases matter too.** They show Meta actively protects Instagram public data and treats unauthorized commercial collection as a terms and computer-access matter.

### Gaps
- I found no Meta newsroom or developer-blog post specific to Business Discovery or Hashtag Search misuse.
- I did not check court dockets for the current status of the Voyager Labs case.
- I found no first-hand reports of App Review outcomes for "central research account" designs; developer forum anecdotes were not found or verified.

## Points for a lawyer, or a Meta Developer Support ticket
1. Does showing `business_discovery` results collected with SOCIA's own token to other paying customers count as permitted sharing under §3.c.ii.4? Does it count as "licensing" Platform Data under §3.a.iv?
2. Is longitudinal storage of competitor metrics "building or augmenting user profiles" (§3.a.v), when the competitors are not Users of SOCIA?
3. Is SOCIA a "Tech Provider"? If so, §5.b.ii.2 (keep each Client's data separate) rules out a cross-customer pool.
4. Does the intended use need Advanced Access and App Review even though only SOCIA's own account makes the calls?
5. Are multiple company-owned research accounts allowed?
6. Can Unified Login give per-customer Business Discovery and Hashtag Search without a Facebook Page? (A technical check, and probably the cleanest compliant alternative.)

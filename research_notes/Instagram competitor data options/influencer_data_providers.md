# Influencer-data API providers as Instagram competitor/Reels data sources for SOCIA

Research date: 2026-11-01. Tool budget was limited (about 16 calls), so several providers got thin coverage. Anything not read on a primary page is marked UNVERIFIED. Third-party comparison pages written by competitors (notably influencers.club's "compare" pages) are flagged as biased.

## What does each provider offer (sourcing, fields, discovery, freshness, limits, price)?

### Takeaway
Only two providers publish real API prices: Modash, with annual minimums from $10k a year, and Influencers.club, from $208 a month on credits. Social Blade sells prepaid credits, but its official pages show no price list. HypeAuditor, CreatorIQ, Phyllo/InsightIQ and Upfluence are sales-quoted. Modash Raw API and Influencers.club "raw" enrichment are the closest fit for "recent Reels of an account that never authorized us". Neither primary page confirmed per-Reel play counts in its response schema.

### Cited Findings

**Modash (Discovery API + Raw API)**
- The Discovery API is described as analyzed, aggregated, searchable data: "search and filters across 380M+ profiles, AI and image search, audience demographics, creator lookalikes, audience overlap, collaboration history". — [Modash API page](https://www.modash.io/influencer-marketing-api)
- The Raw API is described as live, unfiltered data covering "posts, feeds, reels, hashtags, comments and replies, follower changes, media info and downloads", which can be pulled "the moment it goes public". — [Modash API page](https://www.modash.io/influencer-marketing-api)
- Pricing: the Discovery API "starts at $16,200 per year" and the Raw API "starts at $10,000 per year". Both are monthly-credit based. Search costs "0.01 credits per influencer found". Rates for other endpoints are not published. Testing credits come via a booked call, and a 14-day free trial is mentioned. The app (non-API) plans start at $299/mo. — [Modash API page](https://www.modash.io/influencer-marketing-api)
- Discovery filters shown: minimum followers, location, language, gender, contact details, audience credibility, AI search, follower growth, engagement rate, views. Lookalikes are supported ("Discover similar creators across platforms"). Niche/category is not listed as an explicit filter on that page, though "interests" and keywords appear as data points. — [Modash API page](https://www.modash.io/influencer-marketing-api)
- Instagram profile fields in the sample response: engagementRate, engagements, followers, fullname, url, username, isVerified, isPrivate, picture. The analytics list includes "average likes and views" and recent/popular/sponsored posts. — [Modash API page](https://www.modash.io/influencer-marketing-api)
- Raw API endpoints named in a Modash help article (seen only as a search snippet; the page returned 404 when fetched): /user-feed (12 posts per request), /media-info, /media-comments, /user-followers, /user-stories, and a platform-native /search. No reels-specific endpoint or credit cost appeared in the snippet. UNVERIFIED for exact fields. — [Modash help (search snippet)](https://help.modash.io/en/articles/10871299-raw-api-best-practices-onboarding-for-developers)
- Rate limits: the docs only say "Rate limiting errors are always with the HTTP status code 429". No numbers are given. Failed requests do not consume credits. Audience data may come back as `retry_later` ("will have very soon"; retry in a couple of hours). — [Modash docs](https://docs.modash.io/)
- Freshness: the Discovery API is "Refreshed, indexed, query-ready". The Raw API is "Fresh and unfiltered", on-demand. The page labels Raw with both phrases, which is inconsistent. — [Modash API page](https://www.modash.io/influencer-marketing-api)

**Influencers.club**
- Plans: Starter is dashboard only, "from $140/month", minimum 500 credits, no API. Pro (API + dashboard) is "from $208/month" with 500 to 8,000+ credits. Agency is custom. The per-credit price goes "as low as" $0.15 on Starter and $0.23 on Pro. Monthly billing with no annual commitment; plans can be paused. Free trial of 10 credits. The FAQ cites a $199/mo plan, which contradicts the tier list. — [Influencers.club pricing](https://influencers.club/pricing/)
- Credit costs: full profile enrichment by handle is 1 credit (email, post info, growth trends, posting frequency, stats). **Raw enrichment by handle is 0.03 credits ("user and post info only").** Discovery or lookalike search is 0.01 credits per profile. Monitoring is 0.3 credits per creator per day. — [Influencers.club pricing](https://influencers.club/pricing/)
- Discovery: content and AI search, lookalike discovery, multi-platform search, follower growth, posting frequency, engagement signals, audience data. Niche, keyword and location filters are not named on the pricing page. — [Influencers.club pricing](https://influencers.club/pricing/)
- Data source: "We fetch social stats and posts in real-time when you request them – not from a stale database". It claims a database of 340M+ profiles across 47 platforms. — [Influencers.club pricing](https://influencers.club/pricing/)
- Rate limits and per-Reel field lists are not on the pricing page. — [Influencers.club pricing](https://influencers.club/pricing/)

**HypeAuditor**
- The API is sales-quoted: the pricing page lists API access (Discovery, Creator Reports, Campaigns, Market Analysis) as a fixed price after scoping, behind "Contact sales". This comes from a search summary; hypeauditor.com/api/ returned 404 when fetched. — [HypeAuditor pricing](https://www.hypeauditor.com/pricing)
- "Avg. Reels views" is a discovery filter in the Pro tier. Basic covers keyword/AI search, category and industry, followers, ER, views, likes and shares (search summary of the pricing page). — [HypeAuditor pricing](https://www.hypeauditor.com/pricing)
- Old third-party price for the app (not the API): from $299/mo annual. UNVERIFIED and possibly stale. — [Capterra](https://www.capterra.com/p/178954/HypeAuditor/pricing/)

**Phyllo / InsightIQ**
- The Phyllo Social Data API is "Contact for pricing". The article describes the Linkage SDK as "Connect a user's social media profiles to your app", which is a creator-authorized flow. It also lists creator discovery ("APIs to discover creators using deep filtration across niches") and Social Listening, without saying how either is sourced. The page is dated Sept 7, 2025 and labelled "Updated for 2026". — [Phyllo Instagram APIs article](https://www.getphyllo.com/resource/instagram-apis-for-developers)
- A competitor says InsightIQ's API is Enterprise-only and unpriced, with 57 discovery filters and "public data". BIASED/UNVERIFIED. — [Influencers.club compare page](https://influencers.club/compare/insightiq-api-vs-influencers-club-api)
- A third-party review says InsightIQ gathers data "through an API connection with social media channels". UNVERIFIED. — [Influencer Marketing Hub](https://influencermarketinghub.com/insightiq/)
- Reported Phyllo entry price of around $199/mo. UNVERIFIED (third-party blog). G2 says no pricing was provided. — [Influencer Hero](https://www.influencer-hero.com/blogs/phyllo-pricing-and-review); [G2](https://g2.com/products/phyllo/pricing)

**CreatorIQ**
- CreatorIQ says it connects to each major platform's "available public and business APIs" and offers a customer API for importing and exporting creator data. — [CreatorIQ API Pro](https://creatoriq.com/product/api-pro?hsLang=en)
- In April 2023 it was named an inaugural partner of Instagram's creator marketplace API. — [PRWeb release, Apr 2023 (dated)](https://www.prweb.com/releases/2023/4/prweb19272800.htm)
- No public pricing was found; it is an enterprise platform. UNVERIFIED (no price page found).

**Upfluence**
- Lists an API among its features. Nothing found on Instagram sourcing, fields or price. — [GetApp comparison](https://www.getapp.com.au/compare/121071/2057604/upfluence/vs/creatoriq)

**Social Blade (Business API)**
- The official pages mention selectable packages and volume discounts but show no prices. Premium members get bonus monthly credits. Seen via search snippets; socialblade.com/business-api returned 403 when fetched. — [Social Blade API](https://socialblade.com/api); [Social Blade developers](https://socialblade.com/developers)
- Third-party figures: "as low as $0.06 per credit"; 100 credits = $50; 5,000 credits = $1,250. User statistics cost 1 credit per profile per platform, and top lists cost 20 credits per page of 100. UNVERIFIED. — [FitGap](https://us.fitgap.com/products/social-blade); [OutlierKit](https://outlierkit.com/resources/social-blade-pricing/)
- Social Blade is profile-level statistics (followers, growth). No per-Reel data was found. Its "top lists" are ranking lists, not niche or location discovery (inference from the third-party descriptions above).

**Heepsy, Favikon, Captiv8, Grin**
- Not researched in this pass because of the tool budget. See Gaps.

### Inferences
- For SOCIA's use case (an account's recent Reels with public counts), the realistic candidates are the Modash Raw API and Influencers.club raw enrichment. Both are positioned as live, on-request pulls of public posts. Discovery-style products (Modash Discovery, HypeAuditor, InsightIQ) give aggregated averages (avg views/likes), not necessarily a Reel-by-Reel list.
- Social Blade is a poor fit: profile totals only, and no niche discovery.
- CreatorIQ, Upfluence and Grin are campaign-management suites aimed at brands. Their APIs are mostly for moving the customer's own campaign data in and out, not for pulling arbitrary competitor Reels.

### Gaps
- The exact Instagram Reel response fields (play_count/view_count, shares, video URL, thumbnail, caption, timestamp) for the Modash Raw API and Influencers.club raw enrichment were not read on a primary schema page. Both need a docs or sandbox check.
- No provider's rate-limit numbers were found.
- Per-endpoint credit costs for the Modash Raw API are not published.
- HypeAuditor's API docs page (hypeauditor.com/api/) returned 404. Its field list and sourcing were not read.

## Which providers say their Instagram data comes from Meta's official APIs or creator authorization, versus collecting public data themselves?

### Takeaway
None of the public-data providers (Modash, Influencers.club, HypeAuditor) says on the pages read that its Instagram data comes from Meta. Their wording ("the moment it goes public", "We fetch social stats and posts in real-time") points to collecting public web data themselves. Phyllo's core product is creator-authorized (an SDK the creator connects). CreatorIQ claims official platform API partnerships. Social Blade's terms say it uses third-party APIs, including Instagram's.

### Cited Findings
- Modash: the API page "does not describe how Instagram data is sourced". It says Raw data is available "the moment it goes public". Its Terms of Service (effective August 2026) also give no source. They only say "the data/content collected and displayed through the Services may require availability of third party sites" (s. 9.2). — [Modash API page](https://www.modash.io/influencer-marketing-api); [Modash ToS](https://www.modash.io/legal/terms-of-service)
- Modash ToS (German-language version, Aug 2026, search snippet): "You are responsible for obtaining necessary consent from the creators before collecting and processing their data through Modash's monitoring services." — [Modash ToS (DE)](https://www.modash.io/de/legal/terms-of-service)
- Influencers.club: "We fetch social stats and posts in real-time when you request them – not from a stale database". It also says "public creator contact info is indexed and removals are honored". — [Influencers.club pricing](https://influencers.club/pricing/)
- Phyllo: the Linkage SDK is described as "Connect a user's social media profiles to your app" (creator-authorized). The page does not say how discovery and social listening data is sourced. — [Phyllo article](https://www.getphyllo.com/resource/instagram-apis-for-developers)
- A third-party blog says Phyllo's Stories and Reels metrics depend on creators authenticating through its SDK, "consent-based rather than public-data access". UNVERIFIED. — [Influencer Hero](https://www.influencer-hero.com/blogs/phyllo-pricing-and-review)
- CreatorIQ: connects to each major platform's "available public and business APIs" and was an inaugural Instagram creator marketplace API partner (2023). — [CreatorIQ](https://creatoriq.com/product/api-pro?hsLang=en); [PRWeb 2023](https://www.prweb.com/releases/2023/4/prweb19272800.htm)
- Social Blade terms (search snippet): it "utilizes the API services of third parties including, but not limited to, Facebook, Instagram, Twitch, and YouTube" to keep statistics updated. — [Social Blade Terms](https://socialblade.com/info/terms)

### Inferences
- Meta's official APIs do not give third parties per-Reel play counts for accounts that have not authorized them. Business Discovery returns limited public fields, and Reels insights need the owner's token (see the sibling research on Meta APIs). So any provider that does return those counts for non-authorizing accounts is very likely collecting public web data itself. The providers don't say this; it is an inference.
- SOCIA will not scrape. But buying from a vendor that scrapes still leaves SOCIA dependent on, and reputationally tied to, that collection method. That is a policy decision for Noah, not something these pages resolve.

### Gaps
- No primary "data sources" or compliance page was found for Modash, Influencers.club or HypeAuditor that states the method outright. They would have to be asked in writing.
- Social Blade's terms text was seen only as a search snippet.

## Which offer per-Reel view/play counts for accounts that have not authorized them?

### Takeaway
None was confirmed on a primary schema page. Modash Raw API ("reels", "media info", /user-feed) and Influencers.club raw enrichment ("user and post info") are the likeliest. HypeAuditor and Modash Discovery do expose average Reels views as metrics and filters.

### Cited Findings
- The Modash Raw API lists "reels" and "media info and downloads" as data types. The page "does not list reel-specific play counts". — [Modash API page](https://www.modash.io/influencer-marketing-api)
- Modash analytics include "average likes and views". — [Modash API page](https://www.modash.io/influencer-marketing-api)
- HypeAuditor offers an "Avg. Reels views" filter in its Pro tier (search summary). — [HypeAuditor pricing](https://www.hypeauditor.com/pricing)
- Influencers.club raw enrichment returns "user and post info only", with no field list. — [Influencers.club pricing](https://influencers.club/pricing/)
- Phyllo's Reels metrics come from creator-connected accounts (third-party claim; UNVERIFIED), so they would not cover competitors. — [Influencer Hero](https://www.influencer-hero.com/blogs/phyllo-pricing-and-review)

### Inferences
- SOCIA should get a sandbox response for a public restaurant account from Modash Raw (/user-feed or /media-info) and from Influencers.club raw enrichment, and check whether a play/view count is present per Reel. If a provider does not return the number, SOCIA must show it as unavailable, never as zero (anti-slop P0).

### Gaps
- No response schema with a `play_count` or `video_view_count` field was read for any provider.

## Can SOCIA lawfully redisplay the data in its own product under each provider's terms?

### Takeaway
Modash is the only provider whose terms were read in full. Its API subscriptions include "the right to build and distribute derivative products". It forbids reselling or redistributing the raw Services or Data, forbids bulk saving or export by automation, and requires deleting all Modash data at termination. Modash also markets the API as an engine for white-label platforms. For every other provider, the redistribution terms were not read.

### Cited Findings
- Modash ToS s. 3.1: "For API subscriptions, this license includes the right to build and distribute derivative products, integrations, or services incorporating Modash Data, subject to your subscription limits." — [Modash ToS (Aug 2026)](https://www.modash.io/legal/terms-of-service)
- Modash ToS s. 10.6: "Except as expressly permitted, you may not sublicense, resell, or redistribute the Services or Data to third parties." Agencies may use data for clients if they remain the contracting party. — [Modash ToS](https://www.modash.io/legal/terms-of-service)
- Modash ToS s. 10.5: "you may not copy, modify, distribute, sell, or lease any part of the Services or Data". s. 10.4 prohibits "Using bots, automation tools, scripts, or any other programmatic means to collect, save, or export data in bulk" and calls this a material breach. Section 10.4 sits in tension with the API grant; it presumably targets the app UI, but that is UNVERIFIED. — [Modash ToS](https://www.modash.io/legal/terms-of-service)
- Modash ToS s. 12.4: on termination you must "irrecoverably delete any and all data you received from Modash", except where law requires retention or the DPA permits it. The terms contain no AI/ML restriction. — [Modash ToS](https://www.modash.io/legal/terms-of-service)
- On the Modash API page, Modash promotes using the API "as the engine for a white-label platform". — [Modash API page](https://www.modash.io/influencer-marketing-api)
- Influencers.club: its ToS and DPA are linked but were not read. The pricing page lists integrations (Zapier, Clay, n8n, MCP, CRM enrichment) but no end-user display clause. — [Influencers.club pricing](https://influencers.club/pricing/)
- Social Blade, HypeAuditor, Phyllo/InsightIQ, CreatorIQ, Upfluence: no API redistribution terms were read.

### Inferences
- Under Modash's terms, SOCIA showing competitor Reels and metrics inside its own app, and running its own AI on them, looks like a "derivative product". That appears permitted while the subscription is active. Offering a raw data export or a pass-through API to SOCIA users looks prohibited. Cached data must be purged if SOCIA ever cancels, so SOCIA's history charts built on Modash data would be lost.
- The Modash terms put creator-consent duties on the customer for "monitoring services" (s. per DE snippet). SOCIA should get written confirmation that tracking public competitor accounts is not "monitoring" requiring consent.

### Gaps
- Influencers.club, HypeAuditor, Social Blade and Phyllo API terms on display, caching and redistribution are unread. Each needs a read of its ToS, or a written answer from sales.
- Modash's DPA and any API-specific addendum were not read.

## What would it cost per month at (a) ~2,000 and (b) ~20,000 profile+recent-Reels lookups/month, plus niche discovery?

### Takeaway
ESTIMATES only:
- **Influencers.club** is cheapest if its 0.03-credit raw enrichment includes Reel metrics: about $208/mo for (a) and about $600 to $1,100/mo for (b). With full 1-credit enrichment it is about $500 to $900/mo for (a) and $5,000+/mo for (b).
- **Modash** has a floor of about $833/mo (Raw only) or about $2,183/mo (Raw + Discovery), billed annually. Whether that floor covers 20,000 lookups is unknown.
- All others are quote-only.

### Cited Findings (inputs)
- Modash Raw from $10,000/yr. Modash Discovery from $16,200/yr. Search costs 0.01 credits per result. — [Modash API page](https://www.modash.io/influencer-marketing-api)
- Influencers.club Pro from $208/mo (500 credits minimum). Per-credit as low as $0.23 on Pro. Raw enrich 0.03 credits, full enrich 1 credit, discovery 0.01 credits per profile. — [Influencers.club pricing](https://influencers.club/pricing/)
- Social Blade: 1 credit per profile, $0.06 to $0.50 per credit. UNVERIFIED third-party figures. — [FitGap](https://us.fitgap.com/products/social-blade); [OutlierKit](https://outlierkit.com/resources/social-blade-pricing/)

### Arithmetic (ESTIMATES; assumptions stated)
Discovery assumption: each customer runs 4 niche searches a month, each returning 50 profiles. So (a) 100 × 4 × 50 = 20,000 profile results, and (b) 1,000 × 4 × 50 = 200,000 profile results.

**Influencers.club (Pro)**
- Entry price per credit is $208 / 500 = $0.416. The best published rate is $0.23.
- Discovery credits: (a) 20,000 × 0.01 = 200 credits; (b) 200,000 × 0.01 = 2,000 credits.
- (a), raw enrichment: 2,000 × 0.03 = 60 credits. Total 60 + 200 = 260 credits, below the 500-credit minimum, so **about $208/mo**.
- (a), full enrichment: 2,000 × 1 = 2,000 credits. Total 2,200 credits, so 2,200 × $0.23 = $506 up to 2,200 × $0.416 = $915. **About $500 to $900/mo.**
- (b), raw enrichment: 20,000 × 0.03 = 600 credits. Total 2,600 credits, so 2,600 × $0.23 = $598 up to 2,600 × $0.416 = $1,082. **About $600 to $1,100/mo.**
- (b), full enrichment: 20,000 credits. Total 22,000 credits, so 22,000 × $0.23 = **about $5,060/mo** (best rate; probably Agency/custom at that volume).
- Avoid "Monitoring" for this use. 5,000 creators × 30 days × 0.3 = 45,000 credits, which is about $10k+/mo.

**Modash**
- Raw only: $10,000 / 12 = **about $833/mo floor**, for both (a) and (b). Whether the starting tier's credits cover 2,000 or 20,000 feed calls is UNVERIFIED (per-call credit costs are unpublished).
- Raw + Discovery: ($10,000 + $16,200) / 12 = **about $2,183/mo floor**.
- Discovery credits for search results at 0.01 per result: 200 credits for (a), 2,000 for (b). The dollar value of a credit is unpublished.

**Social Blade** (profile totals only; no Reels, so it doesn't meet the need)
- (a) 2,000 credits × $0.06 to $0.50 = $120 to $1,000/mo.
- (b) 20,000 credits = $1,200 to $10,000/mo. UNVERIFIED prices.

**HypeAuditor, Phyllo/InsightIQ, CreatorIQ, Upfluence**: quote-only. No estimate is possible.

### Inferences
- If a sandbox test shows Influencers.club raw enrichment returns per-Reel counts, it is the low-cost pilot option. Monthly billing with no annual lock-in suits SOCIA's current scale.
- Modash costs more but has clearer, permissive derivative-product terms and stronger discovery (lookalikes, location). It needs a year's commitment.
- Caching weekly pulls and sharing them across customers who track the same competitor would cut lookups below the 5-per-customer figure. That only works if each provider's terms allow cross-customer reuse, which is unverified.

### Gaps
- Modash per-endpoint credit costs and credits included per tier are unpublished; a sales call is needed.
- Influencers.club volume pricing above 8,000 credits is not shown.
- Prices for HypeAuditor, InsightIQ, CreatorIQ, Upfluence, Heepsy, Favikon, Captiv8 and Grin APIs were not found or not researched.
